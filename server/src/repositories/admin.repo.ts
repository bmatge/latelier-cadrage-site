import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';

export interface AdminUserRow {
  readonly id: number;
  readonly display_name: string;
  readonly email: string | null;
  readonly status: 'active' | 'disabled' | 'pending';
  readonly created_at: string;
  readonly last_login_at: string | null;
}

export async function listAllUsers(k: Kdb): Promise<readonly AdminUserRow[]> {
  return await k
    .selectFrom('users')
    .select(['id', 'display_name', 'email', 'status', 'created_at', 'last_login_at'])
    .orderBy('id', 'asc')
    .execute();
}

export async function setUserStatus(
  k: Kdb,
  userId: number,
  status: 'active' | 'disabled',
): Promise<void> {
  await k
    .updateTable('users')
    .set({ status, updated_at: sql<string>`datetime('now')` })
    .where('id', '=', userId)
    .execute();
}

export interface AuditLogEntry {
  readonly id: number;
  readonly actor_id: number | null;
  readonly actor_display_name: string | null;
  readonly actor_email: string | null;
  readonly action: string;
  readonly project_id: number | null;
  readonly resource_type: string | null;
  readonly resource_id: string | null;
  readonly details: string | null;
  readonly ip: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
}

export interface ListAuditOptions {
  readonly action?: string;
  readonly projectId?: number;
  readonly actorId?: number;
  readonly limit?: number;
  readonly before?: number; // cursor : id < before
}

export async function listAuditEntries(
  k: Kdb,
  options: ListAuditOptions = {},
): Promise<readonly AuditLogEntry[]> {
  // LEFT JOIN sur users : `actor_id` peut être null (action système anonyme).
  // L'utilisateur peut aussi avoir été supprimé en cascade entre temps —
  // l'audit_log ne porte pas de FK contrainte vers users, on tolère le miss.
  let q = k
    .selectFrom('audit_log as a')
    .leftJoin('users as u', 'u.id', 'a.actor_id')
    .select([
      'a.id',
      'a.actor_id',
      'u.display_name as actor_display_name',
      'u.email as actor_email',
      'a.action',
      'a.project_id',
      'a.resource_type',
      'a.resource_id',
      'a.details',
      'a.ip',
      'a.user_agent',
      'a.created_at',
    ])
    .orderBy('a.id', 'desc')
    .limit(Math.min(options.limit ?? 100, 500));
  if (options.action) q = q.where('a.action', '=', options.action);
  if (options.projectId !== undefined) q = q.where('a.project_id', '=', options.projectId);
  if (options.actorId !== undefined) q = q.where('a.actor_id', '=', options.actorId);
  if (options.before !== undefined) q = q.where('a.id', '<', options.before);
  return await q.execute();
}

export interface AdminSessionRow {
  readonly id: number;
  readonly user_id: number;
  readonly user_display_name: string;
  readonly user_email: string | null;
  readonly user_status: 'active' | 'disabled' | 'pending';
  readonly ip: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
  readonly last_seen_at: string | null;
  readonly expires_at: string;
  readonly revoked_at: string | null;
}

export interface ListSessionsOptions {
  readonly includeRevoked?: boolean;
  readonly includeExpired?: boolean;
  readonly limit?: number;
}

// Liste les sessions pour la console admin. Par défaut on retourne les
// 50 dernières (toutes — actives, révoquées, expirées) pour donner une
// vue d'audit. Les filtres `includeRevoked`/`includeExpired` à false
// permettent de réduire aux sessions vraiment vivantes.
export async function listSessionsForAdmin(
  k: Kdb,
  options: ListSessionsOptions = {},
): Promise<readonly AdminSessionRow[]> {
  let q = k
    .selectFrom('sessions as s')
    .innerJoin('users as u', 'u.id', 's.user_id')
    .select([
      's.id',
      's.user_id',
      'u.display_name as user_display_name',
      'u.email as user_email',
      'u.status as user_status',
      's.ip',
      's.user_agent',
      's.created_at',
      's.last_seen_at',
      's.expires_at',
      's.revoked_at',
    ])
    .orderBy('s.created_at', 'desc')
    .limit(Math.min(options.limit ?? 50, 200));
  if (options.includeRevoked === false) q = q.where('s.revoked_at', 'is', null);
  if (options.includeExpired === false) {
    q = q.where('s.expires_at', '>', sql<string>`datetime('now')`);
  }
  return await q.execute();
}
