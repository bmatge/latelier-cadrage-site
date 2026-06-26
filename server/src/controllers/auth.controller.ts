import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { AppError, UnauthorizedError } from '../domain/errors.js';
import { consumeCallback, logoutAll, logoutOne, requestLogin } from '../services/auth.service.js';
import { logAudit } from '../services/audit.service.js';
import type { Mailer } from '../services/mailer.service.js';
import { SESSION_COOKIE_NAME } from '../middleware/attach-user.js';
import { asyncH } from '../middleware/async-handler.js';
import { CallbackQuerySchema, MagicLinkRequestSchema } from '../schemas/auth.schemas.js';
import { loadConfig } from '../config/env.js';

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function cookieOpts(req: Request): {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
  secure: boolean;
} {
  const forwarded = req.get('x-forwarded-proto');
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
    secure: req.protocol === 'https' || forwarded === 'https',
  };
}

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
function clientUA(req: Request): string | null {
  return req.get('user-agent') ?? null;
}
function publicBaseUrl(req: Request): string {
  const env = process.env['PUBLIC_BASE_URL'];
  if (env && env.length > 0) return env.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') ?? req.protocol;
  const host = req.get('x-forwarded-host') ?? req.get('host') ?? 'localhost';
  return `${proto}://${host}`;
}

export interface MakeAuthControllerOptions {
  readonly k: Kdb;
  readonly mailer: Mailer;
}

export function makeAuthController(opts: MakeAuthControllerOptions): {
  requestMagicLink: RequestHandler;
  callback: RequestHandler;
  logout: RequestHandler;
  logoutAll: RequestHandler;
  me: RequestHandler;
} {
  const config = loadConfig();
  return {
    requestMagicLink: asyncH(async (req, res) => {
      // Mode proxy (ADR-062) : le magic-link interne est désactivé, l'auth est
      // assurée par le gate du lab en amont. On répond 410 explicitement.
      if (config.AUTH_MODE === 'proxy') {
        res
          .status(410)
          .json({ error: 'magic_link_disabled', message: 'Authentification gérée par le lab.' });
        return;
      }
      // Validation explicite ici (sans validateBody) pour pouvoir réponde
      // 204 même si l'email est invalide (anti-énumération minimal).
      const parsed = MagicLinkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(204).end();
        return;
      }
      try {
        await requestLogin(opts.k, opts.mailer, {
          email: parsed.data.email,
          baseUrl: publicBaseUrl(req),
          ip: clientIp(req),
          userAgent: clientUA(req),
        });
      } catch (err) {
        if (err instanceof AppError && err.status === 429) throw err;
        // Autres erreurs : on swallow pour ne pas révéler d'info
        // (anti-énumération). L'audit reste muet ici.
      }
      res.status(204).end();
    }),
    callback: asyncH(async (req, res) => {
      // Mode proxy : aucun magic-link interne émis → tout callback est caduc,
      // on renvoie simplement à la home (le gate a déjà authentifié).
      if (config.AUTH_MODE === 'proxy') {
        res.redirect(303, '/');
        return;
      }
      const wantsJson = (req.get('accept') ?? '').includes('application/json');
      const parsed = CallbackQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        // Token absent ou malformé : SPA gère via /login, navigateur classique
        // redirigé vers la page de login avec un paramètre d'erreur.
        if (wantsJson) throw new AppError(400, 'validation_error', 'invalid_token');
        res.redirect(303, '/login?error=invalid_link');
        return;
      }
      try {
        const result = await consumeCallback(opts.k, {
          token: parsed.data.token,
          ip: clientIp(req),
          userAgent: clientUA(req),
        });
        res.cookie(SESSION_COOKIE_NAME, result.token, cookieOpts(req));
        if (wantsJson) {
          res.json({
            user_id: result.userId,
            expires_at: result.expiresAt,
            created: result.created,
          });
          return;
        }
        res.redirect(303, '/');
      } catch (err) {
        // Cas le plus fréquent en pratique : l'utilisateur RE-CLIQUE sur
        // l'email après une 1re connexion réussie. Le token est désormais
        // consommé → ce catch se déclenche. Si l'utilisateur a déjà une
        // session valide (cookie posé par attach-user), on le renvoie
        // silencieusement à la home plutôt que de l'angoisser avec une
        // erreur JSON brute. Sinon, redirect vers /login avec un message.
        if (wantsJson) throw err;
        if (req.user) {
          res.redirect(303, '/');
          return;
        }
        res.redirect(303, '/login?error=invalid_or_expired_link');
      }
    }),
    logout: asyncH(async (req, res) => {
      const sessionId = req.sessionId;
      await logoutOne(opts.k, sessionId);
      await logAudit(opts.k, 'auth.logout', {
        actorId: req.user?.id ?? null,
        resourceType: 'session',
        resourceId: sessionId ?? null,
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.status(204).end();
    }),
    logoutAll: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      await logoutAll(opts.k, req.user.id);
      await logAudit(opts.k, 'auth.logout', {
        actorId: req.user.id,
        resourceType: 'session',
        resourceId: 'all',
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.status(204).end();
    }),
    me(req, res, next) {
      if (!req.user) {
        next(new UnauthorizedError());
        return;
      }
      res.json({
        auth_mode: config.AUTH_MODE,
        user: {
          id: req.user.id,
          display_name: req.user.display_name,
          email: req.user.email,
          status: req.user.status,
          roles: req.user.roles,
        },
      });
    },
  };
}
