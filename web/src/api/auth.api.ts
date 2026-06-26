import type { Role } from '@latelier/shared';
import { api } from './client.js';

export interface MeUser {
  readonly id: number;
  readonly display_name: string;
  readonly email: string | null;
  readonly status: 'active' | 'disabled' | 'pending';
  readonly roles: readonly { readonly role: Role; readonly projectId: number | null }[];
}

/** Mode d'authentification du backend (exposé par GET /api/me).
 *  - 'local' : magic-link interne (défaut historique).
 *  - 'proxy' : auth déléguée au gate du lab (ADR-062) — l'UI masque login/logout. */
export type AuthMode = 'local' | 'proxy';

export interface MeResponse {
  readonly user: MeUser | null;
  readonly authMode: AuthMode;
}

export async function requestMagicLink(email: string): Promise<void> {
  await api.post('/auth/magic-link', { email });
}

export async function consumeCallback(
  token: string,
): Promise<{ user_id: number; expires_at: string; created: boolean }> {
  const res = await api.get('/auth/callback', { params: { token } });
  return res.data as { user_id: number; expires_at: string; created: boolean };
}

export async function fetchMe(): Promise<MeResponse> {
  try {
    const res = await api.get('/me');
    const data = res.data as { user: MeUser; auth_mode?: AuthMode };
    return { user: data.user, authMode: data.auth_mode ?? 'local' };
  } catch (err) {
    // Tout statut autre que 200 ⇒ pas de user. On loggue les 5xx pour
    // qu'ils restent visibles en console, mais on ne bloque pas le boot
    // de la SPA (sinon le router guard plante et l'utilisateur ne voit
    // même pas le bouton "Se connecter").
    const e = err as { response?: { status?: number; data?: unknown } };
    if (e.response?.status && e.response.status >= 500) {
      console.error('[auth.fetchMe] server error', e.response.status, e.response.data);
    }
    // 401 sans user : le backend ne joint pas auth_mode (corps strict
    // { error }). En mode proxy l'app n'est joignable que derrière le gate,
    // donc /api/me est toujours authentifié → ce cas ne survient qu'en local
    // hors-gate : défaut 'local' sans incidence (login affiché, normal).
    return { user: null, authMode: 'local' };
  }
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}
