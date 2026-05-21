// User stories & parcours utilisateur — modèle partagé back+front.
//
// Hiérarchie à 3 niveaux :
//   - `Parcours` : un groupe thématique de user stories (ex. « Démarche
//     de réclamation », « Onboarding »). Niveau introduit en 2026-05-22.
//   - `UserStory` : une tâche/objectif d'usager, avec ses étapes.
//   - `Step` : un écran traversé, avec action + commentaire.
//
// Chaque step pointe vers un `Screen` polymorphe qui peut être :
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
  /**
   * Thème de l'écran (clé de `vocab.story_themes` :
   * navigation / information / action / transaction…). Caractérise la
   * nature de l'écran lui-même, pas de la story qui le traverse.
   */
  readonly theme_key?: string | null;
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
  readonly description?: string;
  /**
   * État replié/déplié de l'accordéon « Parcours » — persisté pour
   * permettre à un utilisateur de figer une story plié dans son tour
   * d'horizon.
   */
  readonly collapsed?: boolean;
  readonly steps: readonly Step[];
}

export interface Parcours {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** État replié/déplié du groupe (persisté). */
  readonly collapsed?: boolean;
  readonly stories: readonly UserStory[];
}

export interface UserStoriesData {
  readonly parcours: readonly Parcours[];
}

export const EMPTY_USER_STORIES: UserStoriesData = { parcours: [] };

/**
 * Libellé et id du parcours créé automatiquement quand on importe un
 * bundle legacy `{ stories: [...] }` (modèle plat antérieur à 2026-05-22)
 * ou quand on initialise un projet vide.
 */
export const DEFAULT_PARCOURS_ID = 'p-default';
export const DEFAULT_PARCOURS_LABEL = 'Sans groupe';

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
  const raw = input as { parcours?: unknown; stories?: unknown };

  // Nouveau format : `{ parcours: [...] }`
  if (Array.isArray(raw.parcours)) {
    const out: Parcours[] = [];
    for (const p of raw.parcours) {
      const norm = normalizeParcours(p);
      if (norm) out.push(norm);
    }
    return { parcours: out };
  }

  // Legacy `{ stories: [...] }` (modèle plat antérieur à 2026-05-22) :
  // on l'enveloppe dans un parcours par défaut pour préserver les données.
  if (Array.isArray(raw.stories)) {
    const stories: UserStory[] = [];
    for (const s of raw.stories) {
      const norm = normalizeStory(s);
      if (norm) stories.push(norm);
    }
    if (stories.length === 0) return EMPTY_USER_STORIES;
    return {
      parcours: [
        {
          id: DEFAULT_PARCOURS_ID,
          label: DEFAULT_PARCOURS_LABEL,
          stories,
        },
      ],
    };
  }

  return EMPTY_USER_STORIES;
}

function normalizeParcours(input: unknown): Parcours | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : null;
  if (!id) return null;
  const label = typeof raw['label'] === 'string' ? raw['label'] : '';
  const description = typeof raw['description'] === 'string' ? raw['description'] : '';
  const collapsed = raw['collapsed'] === true;
  const storiesRaw = Array.isArray(raw['stories']) ? raw['stories'] : [];
  const stories: UserStory[] = [];
  for (const s of storiesRaw) {
    const norm = normalizeStory(s);
    if (norm) stories.push(norm);
  }
  return { id, label, description, collapsed, stories };
}

function normalizeStory(input: unknown): UserStory | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : null;
  if (!id) return null;
  const label = typeof raw['label'] === 'string' ? raw['label'] : '';
  const audience_key = typeof raw['audience_key'] === 'string' ? raw['audience_key'] : null;
  const description = typeof raw['description'] === 'string' ? raw['description'] : '';
  const collapsed = raw['collapsed'] === true;
  const stepsRaw = Array.isArray(raw['steps']) ? raw['steps'] : [];
  const steps: Step[] = [];
  // Compatibilité descendante : un legacy `theme_key` au niveau story
  // (ancien modèle) est propagé à tous les screens sans theme_key.
  // Permet aux user stories créées avant cette refonte de ne pas perdre
  // leur thème ; nouveaux screens explicites prennent toujours priorité.
  const legacyStoryTheme =
    typeof raw['theme_key'] === 'string' && raw['theme_key'] ? (raw['theme_key'] as string) : null;
  for (const s of stepsRaw) {
    const norm = normalizeStep(s, legacyStoryTheme);
    if (norm) steps.push(norm);
  }
  return { id, label, audience_key, description, collapsed, steps };
}

function normalizeStep(input: unknown, fallbackTheme: string | null = null): Step | null {
  const leaf = normalizeLeafStep(input, fallbackTheme);
  if (!leaf) return null;
  const raw = input as Record<string, unknown>;
  const branchesRaw = Array.isArray(raw['branches']) ? raw['branches'] : [];
  const branches: Branch[] = [];
  for (const b of branchesRaw) {
    const norm = normalizeBranch(b, fallbackTheme);
    if (norm) branches.push(norm);
  }
  return branches.length ? { ...leaf, branches } : leaf;
}

function normalizeLeafStep(input: unknown, fallbackTheme: string | null = null): LeafStep | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : null;
  if (!id) return null;
  const screen = normalizeScreen(raw['screen'], fallbackTheme);
  if (!screen) return null;
  const action = typeof raw['action'] === 'string' ? raw['action'] : '';
  const comment = typeof raw['comment'] === 'string' ? raw['comment'] : '';
  return { id, screen, action, comment };
}

function normalizeBranch(input: unknown, fallbackTheme: string | null = null): Branch | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : null;
  if (!id) return null;
  const condition = typeof raw['condition'] === 'string' ? raw['condition'] : '';
  const stepsRaw = Array.isArray(raw['steps']) ? raw['steps'] : [];
  const steps: LeafStep[] = [];
  for (const s of stepsRaw) {
    const norm = normalizeLeafStep(s, fallbackTheme);
    if (norm) steps.push(norm);
  }
  return { id, condition, steps };
}

function normalizeScreen(input: unknown, fallbackTheme: string | null = null): Screen | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const kind = raw['kind'];
  if (kind !== 'ghost' && kind !== 'node' && kind !== 'block' && kind !== 'dispositif') {
    return null;
  }
  const ref = typeof raw['ref'] === 'string' ? raw['ref'] : null;
  const title = typeof raw['title'] === 'string' ? raw['title'] : undefined;
  const description = typeof raw['description'] === 'string' ? raw['description'] : undefined;
  const explicitTheme =
    typeof raw['theme_key'] === 'string' && raw['theme_key'] ? (raw['theme_key'] as string) : null;
  const theme_key = explicitTheme ?? fallbackTheme;
  const out: Screen = { kind, ref };
  if (title !== undefined) (out as { title?: string }).title = title;
  if (description !== undefined) (out as { description?: string }).description = description;
  if (theme_key) (out as { theme_key?: string | null }).theme_key = theme_key;
  return out;
}
