import { z } from 'zod';

export const GrantRoleBodySchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']),
  project_id: z.number().int().positive().nullable().optional(),
});

export type GrantRoleBody = z.infer<typeof GrantRoleBodySchema>;

export const AuditQuerySchema = z.object({
  action: z.string().optional(),
  project_id: z.coerce.number().int().positive().optional(),
  actor_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  before: z.coerce.number().int().positive().optional(),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;

const stringBool = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((v) => v === 'true' || v === '1');

export const SessionsQuerySchema = z.object({
  include_revoked: stringBool.optional(),
  include_expired: stringBool.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type SessionsQuery = z.infer<typeof SessionsQuerySchema>;
