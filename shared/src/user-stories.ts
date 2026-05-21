// User stories & parcours utilisateur — modèle partagé back+front.
//
// Une `UserStory` représente une tâche/objectif d'usager (cf. /parcours).
// Chaque story contient une suite ordonnée de `Step`. Chaque step pointe
// vers un `Screen` polymorphe qui peut être :
//   - 'ghost'      : non encore résolu (texte libre, à promouvoir plus tard)
//   - 'node'       : un node de l'arborescence (ref = node.id)
//   - 'block'      : un paragraph dans un node (ref = "nodeId#paragraphId")
//   - 'dispositif' : une ressource/service externe (ref = dispositif.id)
//
// Embranchements : un step peut avoir des `branches`, chacune avec un label
// de condition et une sous-séquence de steps SANS branches (profondeur 1
// verrouillée par le type `LeafStep`).

export type ScreenKind = 'ghost' | 'node' | 'block' | 'dispositif';

export interface Screen {
  readonly kind: ScreenKind;
  /**
   * Référence vers l'entité (node.id, "nodeId#paragraphId", ou dispositif.id).
   * Null pour 'ghost'.
   */
  readonly ref: string | null;
  /** Titre temporaire (mode ghost) ou titre miroir pour affichage rapide. */
  readonly title?: string;
  /** Description temporaire (mode ghost), reprise à la promotion. */
  readonly description?: string;
}

/** Step sans branches — utilisé à l'intérieur d'une branche (profondeur 1). */
export interface LeafStep {
  readonly id: string;
  readonly screen: Screen;
  readonly action: string;
  readonly comment: string;
}

export interface Branch {
  readonly id: string;
  readonly condition: string;
  readonly steps: readonly LeafStep[];
}

export interface Step extends LeafStep {
  readonly branches?: readonly Branch[];
}

export interface UserStory {
  readonly id: string;
  readonly label: string;
  /** Clé de `vocab.audiences` du projet. */
  readonly audience_key?: string | null;
  /** Clé de `vocab.story_themes` du projet (navigation/information/action…). */
  readonly theme_key?: string | null;
  readonly description?: string;
  readonly steps: readonly Step[];
}

export interface UserStoriesData {
  readonly stories: readonly UserStory[];
}

export const EMPTY_USER_STORIES: UserStoriesData = { stories: [] };

/** Construit la ref `nodeId#paragraphId` pour un screen de kind 'block'. */
export function blockRef(nodeId: string, paragraphId: string): string {
  return `${nodeId}#${paragraphId}`;
}

/** Parse une ref `nodeId#paragraphId`. Renvoie null si format invalide. */
export function parseBlockRef(ref: string): { nodeId: string; paragraphId: string } | null {
  const idx = ref.indexOf('#');
  if (idx <= 0 || idx >= ref.length - 1) return null;
  return { nodeId: ref.slice(0, idx), paragraphId: ref.slice(idx + 1) };
}

/**
 * Garde-fou : une story valide a un id, un label non vide, et des steps
 * dont les branches ne re-branchent pas (profondeur 1 max). Cette fonction
 * réécrit défensivement les structures malformées plutôt que de jeter —
 * stratégie cohérente avec la politique de validation runtime (ADR-014).
 */
export function normalizeUserStories(input: unknown): UserStoriesData {
  if (!input || typeof input !== 'object') return EMPTY_USER_STORIES;
  const raw = input as { stories?: unknown };
  const stories = Array.isArray(raw.stories) ? raw.stories : [];
  const out: UserStory[] = [];
  for (const s of stories) {
    const norm = normalizeStory(s);
    if (norm) out.push(norm);
  }
  return { stories: out };
}

function normalizeStory(input: unknown): UserStory | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : null;
  if (!id) return null;
  const label = typeof raw['label'] === 'string' ? raw['label'] : '';
  const audience_key = typeof raw['audience_key'] === 'string' ? raw['audience_key'] : null;
  const theme_key = typeof raw['theme_key'] === 'string' ? raw['theme_key'] : null;
  const description = typeof raw['description'] === 'string' ? raw['description'] : '';
  const stepsRaw = Array.isArray(raw['steps']) ? raw['steps'] : [];
  const steps: Step[] = [];
  for (const s of stepsRaw) {
    const norm = normalizeStep(s);
    if (norm) steps.push(norm);
  }
  return { id, label, audience_key, theme_key, description, steps };
}

function normalizeStep(input: unknown): Step | null {
  const leaf = normalizeLeafStep(input);
  if (!leaf) return null;
  const raw = input as Record<string, unknown>;
  const branchesRaw = Array.isArray(raw['branches']) ? raw['branches'] : [];
  const branches: Branch[] = [];
  for (const b of branchesRaw) {
    const norm = normalizeBranch(b);
    if (norm) branches.push(norm);
  }
  return branches.length ? { ...leaf, branches } : leaf;
}

function normalizeLeafStep(input: unknown): LeafStep | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : null;
  if (!id) return null;
  const screen = normalizeScreen(raw['screen']);
  if (!screen) return null;
  const action = typeof raw['action'] === 'string' ? raw['action'] : '';
  const comment = typeof raw['comment'] === 'string' ? raw['comment'] : '';
  return { id, screen, action, comment };
}

function normalizeBranch(input: unknown): Branch | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : null;
  if (!id) return null;
  const condition = typeof raw['condition'] === 'string' ? raw['condition'] : '';
  const stepsRaw = Array.isArray(raw['steps']) ? raw['steps'] : [];
  const steps: LeafStep[] = [];
  for (const s of stepsRaw) {
    const norm = normalizeLeafStep(s);
    if (norm) steps.push(norm);
  }
  return { id, condition, steps };
}

function normalizeScreen(input: unknown): Screen | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const kind = raw['kind'];
  if (kind !== 'ghost' && kind !== 'node' && kind !== 'block' && kind !== 'dispositif') {
    return null;
  }
  const ref = typeof raw['ref'] === 'string' ? raw['ref'] : null;
  const title = typeof raw['title'] === 'string' ? raw['title'] : undefined;
  const description = typeof raw['description'] === 'string' ? raw['description'] : undefined;
  const out: Screen = { kind, ref };
  if (title !== undefined) (out as { title?: string }).title = title;
  if (description !== undefined) (out as { description?: string }).description = description;
  return out;
}
