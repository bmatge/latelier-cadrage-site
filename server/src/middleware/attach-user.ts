// Lit le cookie de session, vérifie en DB (sessions v2 : hash + active), et
// pose req.user + req.sessionId. Le rôle est résolu via loadGrantsForUser
// au moment du check d'autorisation (middleware authorize).

import type { RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { findActiveSessionByHash, touchSession } from '../repositories/session.repo.js';
import { hashSessionToken } from '../services/session.service.js';
import { loadGrantsForUser } from '../services/rbac.service.js';
import { loadConfig } from '../config/env.js';
import { resolveProxyUser } from '../services/user-onboarding.service.js';

const COOKIE = 'pe_session';

export function makeAttachUser(k: Kdb): RequestHandler {
  const config = loadConfig();
  const proxyHeader = config.PROXY_AUTH_HEADER.toLowerCase();
  return (req, _res, next) => {
    // Mode proxy (ADR-062) : auth déléguée au gate du lab. On fait confiance à
    // l'en-tête d'email injecté — Traefik l'écrase autoritairement sur chaque 200
    // du gate (authResponseHeaders), et l'app n'est joignable que derrière lui.
    // Pas de cookie/session interne ; identité par email (find-or-create).
    if (config.AUTH_MODE === 'proxy') {
      const raw = req.headers[proxyHeader];
      const email = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        next();
        return;
      }
      resolveProxyUser(k, email)
        .then(async (u) => {
          const grants = await loadGrantsForUser(k, u.userId);
          req.user = {
            id: u.userId,
            display_name: u.displayName,
            email,
            status: 'active',
            roles: grants,
          };
          next();
        })
        .catch(next);
      return;
    }
    const token: string | undefined = req.cookies?.[COOKIE];
    if (!token) {
      next();
      return;
    }
    findActiveSessionByHash(k, hashSessionToken(token))
      .then(async (sess) => {
        if (sess && sess.user_status === 'active') {
          await touchSession(k, sess.id);
          const grants = await loadGrantsForUser(k, sess.user_id);
          req.user = {
            id: sess.user_id,
            display_name: sess.user_display_name,
            email: sess.user_email,
            status: sess.user_status,
            roles: grants,
          };
          req.sessionId = sess.id;
          req.sessionToken = token;
        }
        next();
      })
      .catch(next);
  };
}

export const SESSION_COOKIE_NAME = COOKIE;
