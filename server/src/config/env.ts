// Parse l'environnement via Zod et expose une `Config` immuable.
// Toute lecture de `process.env` doit passer par ici — pas de magie ailleurs.

import { z } from 'zod';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(here, '../../../data/app.db');
const DEFAULT_PUBLIC_DIR = resolve(here, '../../../');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_PATH: z.string().min(1).default(DEFAULT_DB_PATH),
  PUBLIC_DIR: z.string().min(1).default(DEFAULT_PUBLIC_DIR),
  /** Liste d'emails séparés par virgules à promouvoir en admin global
   *  au boot du serveur. Idempotent : ne refait rien si l'admin existe
   *  déjà. Utile pour le bootstrap initial (sinon il n'y a aucun admin
   *  dans la DB et la page /admin est inaccessible). */
  BOOTSTRAP_ADMIN_EMAILS: z.string().default(''),
  /** Mode d'authentification.
   *  - 'local' : magic-link interne (défaut, comportement historique).
   *  - 'proxy' : l'app est derrière un proxy d'auth de confiance (le gate du lab,
   *    ADR-062) qui injecte l'email authentifié dans l'en-tête PROXY_AUTH_HEADER.
   *    L'app fait confiance à cet en-tête (Traefik l'écrase autoritairement sur
   *    chaque 200, et l'app n'est joignable que derrière le gate), désactive son
   *    magic-link interne et identifie l'utilisateur par email. Cf. ADR-060. */
  AUTH_MODE: z.enum(['local', 'proxy']).default('local'),
  /** En-tête de confiance lu en mode proxy. Doit être posé autoritairement par le
   *  proxy amont (gate : authResponseHeaders X-Gate-Email). Comparé en minuscules. */
  PROXY_AUTH_HEADER: z.string().min(1).default('x-gate-email'),
});

export type Config = z.infer<typeof EnvSchema>;

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Configuration invalide: ${formatted}`);
  }
  cached = parsed.data;
  return cached;
}

// Pour les tests : permet de reset le cache et d'injecter un env custom.
export function resetConfigCache(): void {
  cached = null;
}

export function parseBootstrapAdminEmails(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes('@'));
}
