import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';
import type { Project, ProjectListItem } from '../db/types.js';
import {
  deleteCommentsForProject,
  deleteProjectRow,
  deleteRevisionsForProject,
  deleteRoadmapRevisionsForProject,
  getProjectById,
  getProjectBySlug,
  insertProject,
  listProjects as repoListProjects,
  updateProjectIsPublic,
} from '../repositories/project.repo.js';
import { listProjectDataRows, replaceProjectData } from '../repositories/project-data.repo.js';
import { getHeadRevision, insertRevision } from '../repositories/revision.repo.js';
import {
  getHeadRoadmapRevision,
  insertRoadmapRevision,
} from '../repositories/roadmap-revision.repo.js';
import { ensureSystemUser } from '../repositories/user.repo.js';
import { DEFAULT_DRUPAL_STRUCTURE, DEFAULT_VOCAB, LEGACY_VOCAB } from './seed.service.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors.js';
import { logAudit } from './audit.service.js';
import { hasPermission } from './rbac.service.js';
import type { RoleGrant } from '@latelier/shared';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const EXPORT_KEYS = [
  'dispositifs',
  'mesures',
  'objectifs',
  'drupal_structure',
  'vocab',
  'user_stories',
] as const;

export async function listProjects(
  k: Kdb,
  viewer: { readonly userId: number | null; readonly grants: readonly RoleGrant[] } | null,
): Promise<readonly ProjectListItem[]> {
  const all = await repoListProjects(k);
  if (!viewer) {
    return all.filter((p) => p.is_public);
  }
  const grantedProjectIds = new Set<number>();
  let globalGrant = false;
  for (const grant of viewer.grants) {
    if (grant.projectId === null) {
      globalGrant = true;
      break;
    }
    grantedProjectIds.add(grant.projectId);
  }
  if (globalGrant) return all;
  return all.filter((p) => p.is_public || grantedProjectIds.has(p.id));
}

export interface UpdateVisibilityInput {
  readonly projectId: number;
  readonly isPublic: boolean;
  readonly actorId: number;
  readonly ip?: string;
  readonly userAgent?: string;
}

export async function updateProjectVisibility(
  k: Kdb,
  input: UpdateVisibilityInput,
): Promise<Project> {
  const project = await getProjectById(k, input.projectId);
  if (!project) throw new NotFoundError('project_not_found');
  if (project.is_public === input.isPublic) return project;
  await updateProjectIsPublic(k, input.projectId, input.isPublic);
  await logAudit(k, input.isPublic ? 'project.publish' : 'project.unpublish', {
    actorId: input.actorId,
    projectId: input.projectId,
    resourceType: 'project',
    resourceId: input.projectId,
    details: { slug: project.slug, is_public: input.isPublic },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  const updated = await getProjectById(k, input.projectId);
  if (!updated) throw new NotFoundError('project_not_found');
  return updated;
}

export function findProjectBySlug(k: Kdb, slug: string): Promise<Project | undefined> {
  return getProjectBySlug(k, slug);
}

export interface CreateProjectInput {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly actorId: number;
  readonly ip?: string;
  readonly userAgent?: string;
}

export async function createProject(k: Kdb, input: CreateProjectInput): Promise<Project> {
  const sysUser = await ensureSystemUser(k);
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  const description = (input.description ?? '').trim().slice(0, 500);

  if (!name) throw new ValidationError('name_required');
  if (!slug || !SLUG_RE.test(slug)) {
    throw new ValidationError(
      'invalid_slug',
      '2-50 chars : a-z, 0-9, tirets ; commence et finit par alphanum.',
    );
  }
  if (await getProjectBySlug(k, slug)) {
    throw new AppError(409, 'slug_taken');
  }

  const id = await k.transaction().execute(async (trx) => {
    const projectId = await insertProject(trx, {
      slug,
      name,
      description,
      createdBy: input.actorId,
    });
    await insertRevision(trx, {
      projectId,
      parentId: null,
      treeJson: JSON.stringify({ id: 'root', label: name, type: 'hub', tldr: '', children: [] }),
      authorId: sysUser.id,
      message: 'Création du projet',
    });
    await insertRoadmapRevision(trx, {
      projectId,
      parentId: null,
      dataJson: JSON.stringify({ meta: {}, items: [] }),
      authorId: sysUser.id,
      message: 'Création du projet',
    });
    const seeds: ReadonlyArray<readonly [string, unknown]> = [
      ['dispositifs', { dispositifs: [] }],
      ['mesures', { mesures: [] }],
      ['objectifs', { axes: [] }],
      ['drupal_structure', DEFAULT_DRUPAL_STRUCTURE],
      ['vocab', DEFAULT_VOCAB],
      ['user_stories', { stories: [] }],
    ];
    for (const [key, value] of seeds) {
      await replaceProjectData(trx, projectId, key, JSON.stringify(value), sysUser.id);
    }
    return projectId;
  });

  const project = await getProjectById(k, id);
  if (!project) throw new AppError(500, 'create_failed');
  await logAudit(k, 'project.create', {
    actorId: input.actorId,
    projectId: project.id,
    resourceType: 'project',
    resourceId: project.id,
    details: { slug: project.slug, name: project.name },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return project;
}

export interface DeleteProjectInput {
  readonly projectId: number;
  readonly actorId: number;
  readonly actorGrants: readonly RoleGrant[];
  readonly ip?: string;
  readonly userAgent?: string;
}

export async function deleteProject(k: Kdb, input: DeleteProjectInput): Promise<number> {
  const project = await getProjectById(k, input.projectId);
  if (!project) return 0;
  const isOwner = project.created_by === input.actorId;
  const canAny = hasPermission(input.actorGrants, 'project:delete:any', input.projectId);
  if (!isOwner && !canAny) throw new ForbiddenError();
  const changes = await k.transaction().execute(async (trx) => {
    await sql`PRAGMA defer_foreign_keys = ON`.execute(trx);
    await deleteCommentsForProject(trx, input.projectId);
    await deleteRevisionsForProject(trx, input.projectId);
    await deleteRoadmapRevisionsForProject(trx, input.projectId);
    return await deleteProjectRow(trx, input.projectId);
  });
  if (changes > 0 && project) {
    await logAudit(k, 'project.delete', {
      actorId: input.actorId,
      projectId: null,
      resourceType: 'project',
      resourceId: project.id,
      details: { slug: project.slug, name: project.name },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  }
  return changes;
}

export interface ProjectBundle {
  readonly version: 1;
  readonly exported_at: string;
  readonly project: {
    readonly slug: string;
    readonly name: string;
    readonly description: string;
  };
  readonly tree: unknown;
  readonly roadmap: unknown;
  readonly data: Readonly<Record<string, unknown>>;
}

export async function exportProjectBundle(
  k: Kdb,
  projectId: number,
): Promise<ProjectBundle | null> {
  const project = await getProjectById(k, projectId);
  if (!project) return null;
  const head = await getHeadRevision(k, projectId);
  const roadmapHead = await getHeadRoadmapRevision(k, projectId);
  const dataRows = await listProjectDataRows(k, projectId);
  const data: Record<string, unknown> = {};
  for (const row of dataRows) {
    if ((EXPORT_KEYS as readonly string[]).includes(row.key)) {
      data[row.key] = JSON.parse(row.json_value);
    }
  }
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    project: {
      slug: project.slug,
      name: project.name,
      description: project.description || '',
    },
    tree: head ? (JSON.parse(head.tree_json) as unknown) : null,
    roadmap: roadmapHead ? (JSON.parse(roadmapHead.data_json) as unknown) : { meta: {}, items: [] },
    data,
  };
}

export interface ImportBundleInput {
  readonly bundle: unknown;
  readonly sysUserId: number;
  readonly actorId: number;
  readonly slugOverride?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface ImportResult {
  readonly project: Project;
  readonly slugWasRenamed: boolean;
  readonly finalSlug: string;
}

interface BundleLike {
  readonly project?: {
    readonly slug?: unknown;
    readonly name?: unknown;
    readonly description?: unknown;
  };
  readonly tree?: unknown;
  readonly roadmap?: unknown;
  readonly data?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Dispatcher unique pour la normalisation au boundary (import + write).
// Idempotent : si la donnée est déjà au bon format, ne change rien.
export function normalizeDataValue(key: string, value: unknown): unknown {
  if (key === 'dispositifs') return normalizeDispositifs(value);
  if (key === 'drupal_structure') return normalizeDrupalStructure(value);
  return value;
}

// Le format historique posait `audience: string` (singulier) sur chaque
// dispositif — divergence avec node.audiences[] / mesures.audiences[] qui
// sont pluriel. Migration vers `audiences: string[]` (cf. bundle-schema.json).
// Cette normalisation tolère 3 cas d'entrée par dispositif :
//  - `audiences: [...]` déjà présent → garde tel quel (drop audience legacy)
//  - `audience: "x"` seul → migré en `audiences: ["x"]`
//  - `audience: ["x","y"]` (cas LLM qui pluralise spontanément) → migré en
//    `audiences: ["x","y"]`
// Les chaînes vides sont filtrées. Le champ `audience` est toujours supprimé
// après migration pour ne pas porter deux sources de vérité.
//
// Côté meta, on normalise aussi `categories` en string[] (cf. coerceLabels)
// pour absorber les LLM qui retournent `[{key, label}]`.
export function normalizeDispositifs(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  const meta = isPlainObject(value['meta']) ? value['meta'] : null;
  const normalizedMeta =
    meta && 'categories' in meta ? { ...meta, categories: coerceLabels(meta['categories']) } : meta;

  if (!Array.isArray(value['dispositifs'])) {
    return normalizedMeta ? { ...value, meta: normalizedMeta } : value;
  }
  const items = (value['dispositifs'] as readonly unknown[]).map((raw) => {
    if (!isPlainObject(raw)) return raw;
    const { audience: legacy, audiences: existing, ...rest } = raw;
    let audiences: readonly string[] | undefined;
    if (Array.isArray(existing)) {
      audiences = existing.filter((a): a is string => typeof a === 'string' && a.trim() !== '');
    } else if (Array.isArray(legacy)) {
      audiences = legacy.filter((a): a is string => typeof a === 'string' && a.trim() !== '');
    } else if (typeof legacy === 'string' && legacy.trim() !== '') {
      audiences = [legacy.trim()];
    }
    return audiences && audiences.length > 0 ? { ...rest, audiences } : rest;
  });
  const out: Record<string, unknown> = { ...value, dispositifs: items };
  if (normalizedMeta) out['meta'] = normalizedMeta;
  return out;
}

// Promeut un array hétérogène `(string | { label?, name?, id? })[]` en
// `string[]`. Les LLM extrapolent souvent les listes de labels en objets
// `[{key, label}]` parce qu'ils voient ce shape ailleurs dans le format.
// Côté app, on n'a besoin que du label affichable — on extrait donc dans
// l'ordre `label > name > id`, on garde les strings telles quelles, et on
// filtre les valeurs vides.
function coerceLabels(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed) out.push(trimmed);
    } else if (isPlainObject(v)) {
      const label =
        (typeof v['label'] === 'string' && v['label']) ||
        (typeof v['name'] === 'string' && v['name']) ||
        (typeof v['id'] === 'string' && v['id']) ||
        '';
      const trimmed = label.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

// `drupal_structure` n'a pas de champ legacy à migrer, mais ses listes
// `content_types` et `taxonomies[*].options` sont des `string[]` que les
// LLM promeuvent fréquemment en `[{key, label}]`. On normalise pour rester
// alignés sur ce qu'attend l'UI (StructureCMS, MaquetteProperties).
export function normalizeDrupalStructure(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = { ...value };
  if ('content_types' in out) out['content_types'] = coerceLabels(out['content_types']);
  if (Array.isArray(out['taxonomies'])) {
    out['taxonomies'] = (out['taxonomies'] as readonly unknown[]).map((tax) => {
      if (!isPlainObject(tax)) return tax;
      if (!('options' in tax)) return tax;
      return { ...tax, options: coerceLabels(tax['options']) };
    });
  }
  return out;
}

async function findFreeSlug(k: Kdb, base: string): Promise<string> {
  if (!(await getProjectBySlug(k, base))) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 50);
    if (!(await getProjectBySlug(k, candidate))) return candidate;
  }
  throw new AppError(500, 'create_failed', 'Impossible de générer un slug libre');
}

export async function importProjectFromBundle(
  k: Kdb,
  input: ImportBundleInput,
): Promise<ImportResult> {
  if (!isPlainObject(input.bundle)) throw new AppError(400, 'bundle_invalid');
  const bundle = input.bundle as BundleLike;
  const meta = isPlainObject(bundle.project) ? bundle.project : {};

  const rawSlug = String(input.slugOverride ?? meta.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  if (!rawSlug || !SLUG_RE.test(rawSlug)) {
    throw new AppError(400, 'bundle_slug_invalid');
  }
  const name = String(meta.name ?? rawSlug)
    .trim()
    .slice(0, 100);
  const description = String(meta.description ?? '')
    .trim()
    .slice(0, 500);

  const tree =
    isPlainObject(bundle.tree) && typeof bundle.tree['id'] === 'string'
      ? bundle.tree
      : { id: 'root', label: name, type: 'hub', tldr: '', children: [] };

  const roadmap =
    isPlainObject(bundle.roadmap) && Array.isArray(bundle.roadmap['items'])
      ? bundle.roadmap
      : { meta: {}, items: [] };

  const dataBundle = isPlainObject(bundle.data) ? bundle.data : {};

  const finalSlug = await findFreeSlug(k, rawSlug);
  const slugWasRenamed = finalSlug !== rawSlug;

  const projectId = await k.transaction().execute(async (trx) => {
    const id = await insertProject(trx, {
      slug: finalSlug,
      name,
      description,
      createdBy: input.actorId,
    });
    await insertRevision(trx, {
      projectId: id,
      parentId: null,
      treeJson: JSON.stringify(tree),
      authorId: input.sysUserId,
      message: 'Import du projet',
    });
    await insertRoadmapRevision(trx, {
      projectId: id,
      parentId: null,
      dataJson: JSON.stringify(roadmap),
      authorId: input.sysUserId,
      message: 'Import du projet',
    });

    // Un bundle sans `data.vocab` est nécessairement un export v1 antérieur à
    // l'inclusion de la clé `vocab` dans `EXPORT_KEYS`. À cette époque l'app
    // tournait avec un vocabulaire hardcodé qui correspond à `LEGACY_VOCAB`
    // (9 publics + 4 échéances 2026-2027 + 10 types de nœud). Si on retombe
    // sur `DEFAULT_VOCAB` (1+3+3) au lieu, toutes les références audience/
    // échéance/page_type du tree importé deviennent invalides — cf. incident
    // cutover 2026-05-17 où le projet historique a perdu ses chips après import.
    const fallbacks: Readonly<Record<string, unknown>> = {
      dispositifs: { dispositifs: [] },
      mesures: { mesures: [] },
      objectifs: { axes: [] },
      drupal_structure: DEFAULT_DRUPAL_STRUCTURE,
      vocab: LEGACY_VOCAB,
      user_stories: { stories: [] },
    };
    for (const key of EXPORT_KEYS) {
      const provided = dataBundle[key];
      const base = isPlainObject(provided) ? provided : fallbacks[key];
      const normalized = normalizeDataValue(key, base);
      await replaceProjectData(trx, id, key, JSON.stringify(normalized), input.sysUserId);
    }
    return id;
  });

  const project = await getProjectById(k, projectId);
  if (!project) throw new NotFoundError('project_not_found');
  await logAudit(k, 'project.import', {
    actorId: input.actorId,
    projectId: project.id,
    resourceType: 'project',
    resourceId: project.id,
    details: { slug: project.slug, name: project.name, slugWasRenamed },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { project, slugWasRenamed, finalSlug };
}
