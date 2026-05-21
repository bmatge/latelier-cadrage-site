<script setup lang="ts">
// Page Parcours utilisateur — hiérarchie à 2 niveaux :
//   - Parcours (groupe thématique : Onboarding, Réclamation, etc.)
//     - User stories (tâches d'usager, chacune avec son fil de fer d'écrans)
//
// Persistance : `project_data.user_stories = { parcours: [...] }` via
// `useUserStoriesStore`. Autosave : chaque mutation déclenche store.save().
//
// Drag-and-drop :
//   - parcours réordonnés verticalement (MIME application/x-parcours-group)
//   - user stories réordonnées DANS un parcours OU migrées d'un parcours
//     à un autre (MIME application/x-parcours-story, payload enrichi avec
//     le parcoursId source)
//   - steps déjà gérés par StoryStepRail (cf. composant)

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  DEFAULT_STORY_THEMES,
  LEGACY_VOCAB,
  normalizeUserStories,
  parseBlockRef,
  type Parcours,
  type Screen,
  type UserStory,
  type UserStoriesData,
  type VocabConfig,
} from '@latelier/shared';
import { useUserStoriesStore, useVocabStore, useDispositifsStore } from '../stores/data.js';
import { useTreeStore, type TreeNode } from '../stores/tree.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import { useConfirm } from '../stores/confirm.js';
import { useCanEdit } from '../composables/useCanEdit.js';
import PageHeader from '../components/ui/PageHeader.vue';
import InlineEdit from '../components/ui/InlineEdit.vue';
import UserStoryCard from '../components/parcours/UserStoryCard.vue';
import ScreenPicker from '../components/parcours/ScreenPicker.vue';
import { newId } from '../components/parcours/screen-kinds.js';

interface DispositifLite {
  id: string;
  name: string;
  description?: string;
}

interface ParagraphLite {
  id: string;
  code: string;
}

const route = useRoute();
const router = useRouter();
const slug = computed(() => String(route.params['slug'] ?? ''));

const storyStore = useUserStoriesStore();
const vocabStore = useVocabStore();
const dispStore = useDispositifsStore();
const treeStore = useTreeStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();
const confirmStore = useConfirm();

onMounted(async () => {
  if (slug.value) {
    await Promise.all([
      storyStore.hydrate(slug.value),
      vocabStore.hydrate(slug.value),
      dispStore.hydrate(slug.value),
      treeStore.hydrate(slug.value),
    ]);
  }
});
watch(slug, async (s) => {
  if (!s) return;
  await Promise.all([
    storyStore.hydrate(s),
    vocabStore.hydrate(s),
    dispStore.hydrate(s),
    treeStore.hydrate(s),
  ]);
});

const canEdit = useCanEdit('data:write', () => slug.value);

const data = computed<UserStoriesData>(() => normalizeUserStories(storyStore.data));

const vocab = computed<VocabConfig>(() => {
  const v = vocabStore.data as VocabConfig | null;
  if (v && Array.isArray(v.audiences)) return v;
  return LEGACY_VOCAB;
});

const themes = computed(() => vocab.value.story_themes ?? DEFAULT_STORY_THEMES);
const audiences = computed(() => vocab.value.audiences);

// ----- Catalogues annexes (pour le picker) -----

const dispositifs = computed<DispositifLite[]>(() => {
  const raw = dispStore.data as { dispositifs?: unknown[] } | null;
  if (!raw || !Array.isArray(raw.dispositifs)) return [];
  return (raw.dispositifs as Array<Record<string, unknown>>).map((d) => ({
    id: String(d['id'] ?? ''),
    name: String(d['name'] ?? d['id'] ?? ''),
    description: typeof d['description'] === 'string' ? (d['description'] as string) : '',
  }));
});

const nodeIndex = computed<Map<string, TreeNode>>(() => {
  const out = new Map<string, TreeNode>();
  const walk = (n: TreeNode): void => {
    out.set(n.id, n);
    for (const c of n.children ?? []) walk(c);
  };
  if (treeStore.tree) walk(treeStore.tree);
  return out;
});

const paragraphsByNode = computed<Map<string, ParagraphLite[]>>(() => {
  const out = new Map<string, ParagraphLite[]>();
  const walk = (n: TreeNode): void => {
    const maquette = n['maquette'] as { paragraphs?: Array<Record<string, unknown>> } | undefined;
    const fromMaquette = Array.isArray(maquette?.paragraphs) ? maquette!.paragraphs! : [];
    const fromLegacy = Array.isArray(n['blocks'])
      ? (n['blocks'] as Array<Record<string, unknown>>)
      : [];
    const list = fromMaquette.length ? fromMaquette : fromLegacy;
    const cleaned: ParagraphLite[] = [];
    list.forEach((p, idx) => {
      if (!p || typeof p !== 'object') return;
      const id = typeof p['id'] === 'string' && p['id'] ? p['id'] : `legacy-${idx}`;
      const code =
        typeof p['code'] === 'string' && p['code']
          ? p['code']
          : typeof p['type'] === 'string' && p['type']
            ? (p['type'] as string)
            : '(bloc)';
      cleaned.push({ id, code });
    });
    if (cleaned.length) out.set(n.id, cleaned);
    for (const c of n.children ?? []) walk(c);
  };
  if (treeStore.tree) walk(treeStore.tree);
  return out;
});

function resolveScreen(s: Screen): { label: string; subtitle?: string } {
  if (s.kind === 'ghost') return { label: s.title || '(à définir)' };
  if (s.kind === 'node') {
    const n = s.ref ? nodeIndex.value.get(s.ref) : null;
    if (n) return { label: n.label, subtitle: 'Page' };
    return { label: s.title || s.ref || 'Page introuvable', subtitle: 'Page (lien rompu)' };
  }
  if (s.kind === 'block') {
    const parsed = s.ref ? parseBlockRef(s.ref) : null;
    if (parsed) {
      const node = nodeIndex.value.get(parsed.nodeId);
      const paras = paragraphsByNode.value.get(parsed.nodeId) ?? [];
      const para = paras.find((p) => p.id === parsed.paragraphId);
      if (node && para) {
        return { label: para.code, subtitle: node.label };
      }
    }
    return { label: s.title || 'Bloc introuvable', subtitle: 'Bloc (lien rompu)' };
  }
  const d = s.ref ? dispositifs.value.find((x) => x.id === s.ref) : null;
  if (d) return { label: d.name, subtitle: 'Sortie externe' };
  return { label: s.title || s.ref || 'Ressource introuvable', subtitle: 'Sortie (lien rompu)' };
}

// ----- helpers data -----

function ensureEditOrModal(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer.");
  return false;
}

async function commit(next: UserStoriesData): Promise<void> {
  storyStore.setData(next);
  await storyStore.save();
}

function cloneParcours(): Parcours[] {
  return JSON.parse(JSON.stringify(data.value.parcours)) as Parcours[];
}

/** Trouve la story par id à travers tous les parcours. */
function findStoryLocation(
  list: Parcours[],
  storyId: string,
): { parcoursIdx: number; storyIdx: number } | null {
  for (let i = 0; i < list.length; i++) {
    const j = list[i]!.stories.findIndex((s) => s.id === storyId);
    if (j >= 0) return { parcoursIdx: i, storyIdx: j };
  }
  return null;
}

// ----- mutations PARCOURS -----

function addParcours(): void {
  if (!ensureEditOrModal()) return;
  const next = cloneParcours();
  next.push({
    id: newId('p'),
    label: 'Nouveau parcours',
    description: '',
    collapsed: false,
    stories: [],
  });
  void commit({ parcours: next });
}

function updateParcours(id: string, patch: Partial<Parcours>): void {
  if (!ensureEditOrModal()) return;
  const next = cloneParcours();
  const i = next.findIndex((p) => p.id === id);
  if (i < 0) return;
  next[i] = { ...next[i]!, ...patch };
  void commit({ parcours: next });
}

async function removeParcours(id: string): Promise<void> {
  if (!ensureEditOrModal()) return;
  const p = data.value.parcours.find((x) => x.id === id);
  if (!p) return;
  const opts: { title: string; confirmLabel: string; danger: true; message?: string } = {
    title: `Supprimer le parcours « ${p.label} » ?`,
    confirmLabel: 'Supprimer',
    danger: true,
  };
  if (p.stories.length) {
    opts.message = `${p.stories.length} user story(ies) seront aussi supprimées.`;
  }
  const ok = await confirmStore.ask(opts);
  if (!ok) return;
  void commit({ parcours: cloneParcours().filter((x) => x.id !== id) });
}

// ----- mutations USER STORIES -----

function addStory(parcoursId: string): void {
  if (!ensureEditOrModal()) return;
  const next = cloneParcours();
  const i = next.findIndex((p) => p.id === parcoursId);
  if (i < 0) return;
  const story: UserStory = {
    id: newId('us'),
    label: 'Nouvelle user story',
    audience_key: null,
    description: '',
    steps: [],
  };
  next[i] = { ...next[i]!, stories: [...next[i]!.stories, story] };
  void commit({ parcours: next });
}

function updateStory(storyId: string, patch: Partial<UserStory>): void {
  if (!ensureEditOrModal()) return;
  const next = cloneParcours();
  const loc = findStoryLocation(next, storyId);
  if (!loc) return;
  const parc = next[loc.parcoursIdx]!;
  const stories = [...parc.stories];
  stories[loc.storyIdx] = { ...stories[loc.storyIdx]!, ...patch };
  next[loc.parcoursIdx] = { ...parc, stories };
  void commit({ parcours: next });
}

async function removeStory(storyId: string): Promise<void> {
  if (!ensureEditOrModal()) return;
  const loc = findStoryLocation(cloneParcours(), storyId);
  if (!loc) return;
  const story = data.value.parcours[loc.parcoursIdx]!.stories[loc.storyIdx]!;
  const opts: { title: string; confirmLabel: string; danger: true; message?: string } = {
    title: `Supprimer la user story « ${story.label} » ?`,
    confirmLabel: 'Supprimer',
    danger: true,
  };
  if (story.steps.length) {
    opts.message = `${story.steps.length} étape(s) seront aussi supprimées.`;
  }
  const ok = await confirmStore.ask(opts);
  if (!ok) return;
  const next = cloneParcours();
  const loc2 = findStoryLocation(next, storyId);
  if (!loc2) return;
  const parc = next[loc2.parcoursIdx]!;
  next[loc2.parcoursIdx] = {
    ...parc,
    stories: parc.stories.filter((s) => s.id !== storyId),
  };
  void commit({ parcours: next });
}

// ----- ScreenPicker -----

const pickerOpen = ref(false);
const pickerTarget = ref<{
  storyId: string;
  stepId: string;
  branchId: string | null;
  subStepId: string | null;
} | null>(null);

const pickerCurrent = computed<Screen>(() => {
  const t = pickerTarget.value;
  if (!t) return { kind: 'ghost', ref: null };
  for (const p of data.value.parcours) {
    const story = p.stories.find((s) => s.id === t.storyId);
    if (!story) continue;
    if (t.branchId && t.subStepId) {
      const step = story.steps.find((s) => s.id === t.stepId);
      const branch = step?.branches?.find((b) => b.id === t.branchId);
      const sub = branch?.steps.find((s) => s.id === t.subStepId);
      return sub?.screen ?? { kind: 'ghost', ref: null };
    }
    return story.steps.find((s) => s.id === t.stepId)?.screen ?? { kind: 'ghost', ref: null };
  }
  return { kind: 'ghost', ref: null };
});

function openPicker(
  storyId: string,
  stepId: string,
  branchId: string | null,
  subStepId: string | null,
): void {
  if (!ensureEditOrModal()) return;
  pickerTarget.value = { storyId, stepId, branchId, subStepId };
  pickerOpen.value = true;
}

function applyScreen(screen: Screen): void {
  const t = pickerTarget.value;
  if (!t) return;
  const next = cloneParcours();
  for (const parc of next) {
    const story = parc.stories.find((s) => s.id === t.storyId);
    if (!story) continue;
    if (t.branchId && t.subStepId) {
      const step = story.steps.find((s) => s.id === t.stepId);
      const branch = step?.branches?.find((b) => b.id === t.branchId);
      const sub = branch?.steps.find((s) => s.id === t.subStepId);
      if (sub) (sub as { screen: Screen }).screen = screen;
    } else {
      const step = story.steps.find((s) => s.id === t.stepId);
      if (step) (step as { screen: Screen }).screen = screen;
    }
    break;
  }
  void commit({ parcours: next });
}

// ----- Promotion ghost → entité (Phase C) -----

async function promoteToNode(payload: { title: string; description: string }): Promise<void> {
  if (!ensureEditOrModal()) return;
  if (!treeStore.tree) return;
  const newId2 = 'n' + Math.random().toString(36).slice(2, 8);
  const newNode: TreeNode = {
    id: newId2,
    label: payload.title,
    tldr: payload.description,
    types: ['editorial'],
    audiences: [],
    dispositifs: [],
    mesures: [],
    blocks: [],
    children: [],
  };
  const newTree: TreeNode = {
    ...treeStore.tree,
    children: [...(treeStore.tree.children ?? []), newNode],
  };
  treeStore.setTree(newTree);
  await treeStore.save('Création depuis Parcours');
  applyScreen({ kind: 'node', ref: newId2, title: payload.title });
}

async function promoteToDispositif(payload: { title: string; description: string }): Promise<void> {
  if (!ensureEditOrModal()) return;
  const raw = (dispStore.data as { dispositifs?: unknown[]; meta?: unknown } | null) ?? {
    dispositifs: [],
  };
  const list = Array.isArray(raw.dispositifs) ? [...raw.dispositifs] : [];
  const newId2 = 'd' + Math.random().toString(36).slice(2, 8);
  list.push({
    id: newId2,
    name: payload.title,
    description: payload.description,
    audiences: [],
  });
  dispStore.setData({ ...raw, dispositifs: list });
  await dispStore.save();
  applyScreen({ kind: 'dispositif', ref: newId2, title: payload.title });
}

// ----- Ouverture d'une entité dans sa page d'édition -----
//
// Le step pointe vers une entité (node, bloc, dispositif). Le bouton
// « ouvrir » de la carte step demande à naviguer vers la page d'édition
// concernée, avec une query string qui pré-sélectionne l'entité.
//   - kind='node'       → /p/:slug/arborescence?node=<id>
//   - kind='block'      → /p/:slug/maquette?node=<nodeId>&paragraph=<pId>
//   - kind='dispositif' → /p/:slug/dispositifs?id=<id>
//   - kind='ghost'      → ignoré (rien à ouvrir)

function onOpenEntity(screen: Screen): void {
  if (!screen.ref) return;
  const params = { slug: slug.value };
  if (screen.kind === 'node') {
    void router.push({ name: 'project-tree', params, query: { node: screen.ref } });
  } else if (screen.kind === 'block') {
    const parsed = parseBlockRef(screen.ref);
    if (!parsed) return;
    void router.push({
      name: 'project-maquette',
      params,
      query: { node: parsed.nodeId, paragraph: parsed.paragraphId },
    });
  } else if (screen.kind === 'dispositif') {
    void router.push({ name: 'project-dispositifs', params, query: { id: screen.ref } });
  }
}

// ----- Drag des STEPS cross-story (relais venant de UserStoryCard) -----

function onCrossMoveStep(payload: {
  sourceStoryId: string;
  sourceStepId: string;
  targetStoryId: string;
  targetStepId: string;
  mode: 'before' | 'after';
}): void {
  if (!ensureEditOrModal()) return;
  const next = cloneParcours();
  const sLoc = findStoryLocation(next, payload.sourceStoryId);
  const tLoc = findStoryLocation(next, payload.targetStoryId);
  if (!sLoc || !tLoc) return;

  const sourceStory = next[sLoc.parcoursIdx]!.stories[sLoc.storyIdx]!;
  const sourceSteps = [...sourceStory.steps];
  const stepIdx = sourceSteps.findIndex((s) => s.id === payload.sourceStepId);
  if (stepIdx < 0) return;
  const [moved] = sourceSteps.splice(stepIdx, 1);
  if (!moved) return;
  const updatedSourceParc = next[sLoc.parcoursIdx]!;
  const sourceStories = [...updatedSourceParc.stories];
  sourceStories[sLoc.storyIdx] = { ...sourceStory, steps: sourceSteps };
  next[sLoc.parcoursIdx] = { ...updatedSourceParc, stories: sourceStories };

  // Si même story source et target → on a déjà retiré, target = même tableau
  let targetSteps: typeof sourceSteps;
  if (sLoc.parcoursIdx === tLoc.parcoursIdx && sLoc.storyIdx === tLoc.storyIdx) {
    targetSteps = sourceSteps;
  } else {
    targetSteps = [...next[tLoc.parcoursIdx]!.stories[tLoc.storyIdx]!.steps];
  }
  const targetIdx = targetSteps.findIndex((s) => s.id === payload.targetStepId);
  if (targetIdx < 0) targetSteps.push(moved);
  else targetSteps.splice(payload.mode === 'before' ? targetIdx : targetIdx + 1, 0, moved);

  const updatedTargetParc = next[tLoc.parcoursIdx]!;
  const targetStories = [...updatedTargetParc.stories];
  targetStories[tLoc.storyIdx] = { ...targetStories[tLoc.storyIdx]!, steps: targetSteps };
  next[tLoc.parcoursIdx] = { ...updatedTargetParc, stories: targetStories };

  void commit({ parcours: next });
}

// ----- Drag des PARCOURS (réorganisation verticale) -----

const PARCOURS_DRAG_MIME = 'application/x-parcours-group';

function onParcoursDragStart(e: DragEvent, parcoursId: string): void {
  if (!canEdit.value || !e.dataTransfer) {
    e.preventDefault();
    return;
  }
  // Bloque le drag si on a cliqué sur un élément interactif (input/select/
  // button/textarea/lien). Ailleurs sur le groupe : drag autorisé. Plus
  // robuste cross-browser que de vérifier `target.closest('.handle')` car
  // `e.target` dans dragstart varie selon les browsers (parfois le draggable
  // lui-même, parfois l'enfant sous la souris).
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, button, a, [contenteditable]')) {
    e.preventDefault();
    return;
  }
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(PARCOURS_DRAG_MIME, parcoursId);
  e.dataTransfer.setData('text/plain', parcoursId);
}

function isParcoursDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(PARCOURS_DRAG_MIME);
}

function onParcoursDragOver(e: DragEvent): void {
  if (!canEdit.value || !isParcoursDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const offset = e.clientY - rect.top;
  el.classList.remove('drag-over-before', 'drag-over-after');
  el.classList.add(offset < rect.height * 0.5 ? 'drag-over-before' : 'drag-over-after');
}

function onParcoursDragLeave(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove('drag-over-before', 'drag-over-after');
}

function onParcoursDrop(e: DragEvent, targetId: string): void {
  if (!canEdit.value) return;
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  const mode: 'before' | 'after' = el.classList.contains('drag-over-before') ? 'before' : 'after';
  el.classList.remove('drag-over-before', 'drag-over-after');
  const sourceId = e.dataTransfer?.getData(PARCOURS_DRAG_MIME);
  if (!sourceId || sourceId === targetId) return;
  const next = cloneParcours();
  const sIdx = next.findIndex((p) => p.id === sourceId);
  if (sIdx < 0) return;
  const [moved] = next.splice(sIdx, 1);
  if (!moved) return;
  const tIdx = next.findIndex((p) => p.id === targetId);
  if (tIdx < 0) next.push(moved);
  else next.splice(mode === 'before' ? tIdx : tIdx + 1, 0, moved);
  void commit({ parcours: next });
}

// ----- Drag des USER STORIES (réordonner dans un parcours OU migrer entre parcours) -----

const STORY_DRAG_MIME = 'application/x-parcours-story';

interface StoryDragPayload {
  parcoursId: string;
  storyId: string;
}

function onStoryDragStart(e: DragEvent, parcoursId: string, storyId: string): void {
  if (!canEdit.value || !e.dataTransfer) {
    e.preventDefault();
    return;
  }
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, button, a, [contenteditable]')) {
    e.preventDefault();
    return;
  }
  // Évite que le dragstart bubble vers le parent `.parcours-group` qui
  // déclencherait ALORS son propre drag (la story prendrait l'apparence
  // d'un drag de parcours). stopPropagation isole les deux niveaux.
  e.stopPropagation();
  e.dataTransfer.effectAllowed = 'move';
  const payload: StoryDragPayload = { parcoursId, storyId };
  e.dataTransfer.setData(STORY_DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.setData('text/plain', storyId);
}

function isStoryDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(STORY_DRAG_MIME);
}

function onStoryDragOver(e: DragEvent): void {
  if (!canEdit.value || !isStoryDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const offset = e.clientY - rect.top;
  el.classList.remove('drag-over-before', 'drag-over-after');
  el.classList.add(offset < rect.height * 0.5 ? 'drag-over-before' : 'drag-over-after');
}

function onStoryDragLeave(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove('drag-over-before', 'drag-over-after');
}

function onStoryDrop(e: DragEvent, targetParcoursId: string, targetStoryId: string): void {
  if (!canEdit.value) return;
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  const mode: 'before' | 'after' = el.classList.contains('drag-over-before') ? 'before' : 'after';
  el.classList.remove('drag-over-before', 'drag-over-after');
  const raw = e.dataTransfer?.getData(STORY_DRAG_MIME);
  if (!raw) return;
  let src: StoryDragPayload;
  try {
    src = JSON.parse(raw) as StoryDragPayload;
  } catch {
    return;
  }
  if (src.storyId === targetStoryId) return;

  const next = cloneParcours();
  const sIdx = next.findIndex((p) => p.id === src.parcoursId);
  const tIdx = next.findIndex((p) => p.id === targetParcoursId);
  if (sIdx < 0 || tIdx < 0) return;

  const sourceStories = [...next[sIdx]!.stories];
  const storyIdx = sourceStories.findIndex((s) => s.id === src.storyId);
  if (storyIdx < 0) return;
  const [moved] = sourceStories.splice(storyIdx, 1);
  if (!moved) return;
  next[sIdx] = { ...next[sIdx]!, stories: sourceStories };

  const targetStories = sIdx === tIdx ? sourceStories : [...next[tIdx]!.stories];
  const targetIdx = targetStories.findIndex((s) => s.id === targetStoryId);
  if (targetIdx < 0) targetStories.push(moved);
  else targetStories.splice(mode === 'before' ? targetIdx : targetIdx + 1, 0, moved);
  next[tIdx] = { ...next[tIdx]!, stories: targetStories };

  void commit({ parcours: next });
}

// Drop sur la zone du parcours mais hors d'une story (= append à la fin)
function onStoryDropOnGroup(e: DragEvent, targetParcoursId: string): void {
  if (!canEdit.value || !isStoryDrag(e)) return;
  e.preventDefault();
  const raw = e.dataTransfer?.getData(STORY_DRAG_MIME);
  if (!raw) return;
  let src: StoryDragPayload;
  try {
    src = JSON.parse(raw) as StoryDragPayload;
  } catch {
    return;
  }
  if (src.parcoursId === targetParcoursId) return;
  const next = cloneParcours();
  const sIdx = next.findIndex((p) => p.id === src.parcoursId);
  const tIdx = next.findIndex((p) => p.id === targetParcoursId);
  if (sIdx < 0 || tIdx < 0) return;
  const sourceStories = [...next[sIdx]!.stories];
  const storyIdx = sourceStories.findIndex((s) => s.id === src.storyId);
  if (storyIdx < 0) return;
  const [moved] = sourceStories.splice(storyIdx, 1);
  if (!moved) return;
  next[sIdx] = { ...next[sIdx]!, stories: sourceStories };
  next[tIdx] = { ...next[tIdx]!, stories: [...next[tIdx]!.stories, moved] };
  void commit({ parcours: next });
}

// ----- Recherche -----

const search = ref('');
const filteredParcours = computed<readonly Parcours[]>(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return data.value.parcours;
  const out: Parcours[] = [];
  for (const p of data.value.parcours) {
    const matchGroup =
      p.label.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
    const stories = p.stories.filter(
      (s) =>
        matchGroup ||
        s.label.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        s.steps.some(
          (st) =>
            st.action.toLowerCase().includes(q) ||
            st.comment.toLowerCase().includes(q) ||
            (st.screen.title ?? '').toLowerCase().includes(q),
        ),
    );
    if (matchGroup || stories.length) out.push({ ...p, stories });
  }
  return out;
});
</script>

<template>
  <section>
    <PageHeader
      title="Parcours utilisateur"
      subtitle="Groupes thématiques (parcours) qui contiennent des user stories — ce que les usagers viennent faire, et par quelles pages, blocs ou ressources externes ils passent."
    >
      <template #toolbar>
        <div class="parcours-toolbar">
          <input
            v-model="search"
            type="search"
            class="fr-input"
            placeholder="Rechercher (parcours, stories, étapes)…"
          />
          <button
            v-if="canEdit"
            type="button"
            class="fr-btn fr-icon-add-line fr-btn--icon-left"
            @click="addParcours"
          >
            Nouveau parcours
          </button>
        </div>
      </template>
    </PageHeader>

    <div v-if="storyStore.loading" class="loading">Chargement…</div>
    <div v-else-if="!data.parcours.length" class="empty">
      <p>Aucun parcours pour l'instant.</p>
      <p v-if="canEdit">
        Cliquez sur « Nouveau parcours » pour démarrer. Un parcours regroupe les user stories qui
        partagent un même contexte métier (ex. « Onboarding », « Réclamation »).
      </p>
    </div>
    <div v-else class="parcours-list">
      <div
        v-for="parcours in filteredParcours"
        :key="parcours.id"
        class="parcours-group"
        :draggable="canEdit"
        @dragstart="onParcoursDragStart($event, parcours.id)"
        @dragover="onParcoursDragOver"
        @dragleave="onParcoursDragLeave"
        @drop="onParcoursDrop($event, parcours.id)"
      >
        <header class="parcours-group__head">
          <span
            class="parcours-group__drag-handle fr-icon-drag-move-2-line"
            :class="{ 'parcours-group__drag-handle--disabled': !canEdit }"
            aria-hidden="true"
            :title="
              canEdit ? 'Glisser pour réordonner les parcours' : 'Activer l\'édition pour déplacer'
            "
            @click="canEdit ? null : ensureEditOrModal()"
          ></span>
          <button
            type="button"
            class="parcours-group__toggle fr-btn fr-btn--tertiary-no-outline fr-btn--sm"
            :class="parcours.collapsed ? 'fr-icon-arrow-right-s-line' : 'fr-icon-arrow-down-s-line'"
            :title="parcours.collapsed ? 'Déplier le parcours' : 'Replier le parcours'"
            @click="updateParcours(parcours.id, { collapsed: !parcours.collapsed })"
          ></button>
          <div class="parcours-group__title">
            <InlineEdit
              :value="parcours.label"
              placeholder="Nom du parcours"
              display-class="parcours-group__title-display"
              input-class="parcours-group__title-input"
              :can-edit="canEdit"
              @update="(v) => updateParcours(parcours.id, { label: v })"
              @edit-attempt="ensureEditOrModal"
            />
            <p class="parcours-group__count">
              {{ parcours.stories.length }} user story{{ parcours.stories.length > 1 ? 's' : '' }}
            </p>
          </div>
          <button
            type="button"
            class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line"
            :disabled="!canEdit"
            :title="canEdit ? 'Supprimer le parcours' : 'Activer l\'édition pour supprimer'"
            @click="canEdit ? removeParcours(parcours.id) : ensureEditOrModal()"
          ></button>
        </header>
        <p v-if="!parcours.collapsed" class="parcours-group__desc">
          <InlineEdit
            :value="parcours.description ?? ''"
            placeholder="Description du parcours (intention, périmètre métier) — facultatif"
            :textarea="true"
            :rows="1"
            :can-edit="canEdit"
            @update="(v) => updateParcours(parcours.id, { description: v })"
            @edit-attempt="ensureEditOrModal"
          />
        </p>

        <div
          v-if="!parcours.collapsed"
          class="parcours-group__stories"
          @dragover="onStoryDragOver"
          @drop="onStoryDropOnGroup($event, parcours.id)"
        >
          <div
            v-for="story in parcours.stories"
            :key="story.id"
            class="story-drop-wrap"
            :draggable="canEdit"
            @dragstart="onStoryDragStart($event, parcours.id, story.id)"
            @dragover.stop="onStoryDragOver($event)"
            @dragleave="onStoryDragLeave"
            @drop.stop="onStoryDrop($event, parcours.id, story.id)"
          >
            <UserStoryCard
              :story="story"
              :can-edit="canEdit"
              :audiences="audiences"
              :themes="themes"
              :resolve-screen="resolveScreen"
              @update="(patch) => updateStory(story.id, patch)"
              @remove="removeStory(story.id)"
              @pick-screen="
                (stepId, branchId, subStepId) => openPicker(story.id, stepId, branchId, subStepId)
              "
              @open-entity="onOpenEntity"
              @cross-move="(payload) => onCrossMoveStep({ ...payload, targetStoryId: story.id })"
              @edit-attempt="ensureEditOrModal"
            />
          </div>
          <button
            type="button"
            class="parcours-group__add-story fr-btn fr-btn--tertiary fr-btn--sm fr-icon-add-line fr-btn--icon-left"
            :disabled="!canEdit"
            @click="canEdit ? addStory(parcours.id) : ensureEditOrModal()"
          >
            User story
          </button>
        </div>
      </div>
    </div>

    <ScreenPicker
      :open="pickerOpen"
      :current="pickerCurrent"
      :tree="treeStore.tree"
      :dispositifs="dispositifs"
      :node-maquettes="paragraphsByNode"
      @update="applyScreen"
      @promote-node="promoteToNode"
      @promote-dispositif="promoteToDispositif"
      @close="pickerOpen = false"
    />
  </section>
</template>

<style scoped>
.parcours-toolbar {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-top: 0.5rem;
}
.parcours-toolbar .fr-input {
  max-width: 320px;
}
.loading,
.empty {
  padding: 1.5rem;
  text-align: center;
  color: #666;
  background: #fafafa;
  border-radius: 4px;
}
.empty p {
  margin: 0.3rem 0;
}
.parcours-list {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-top: 1rem;
}
.parcours-group {
  border: 1px solid #c8c8e0;
  border-radius: 8px;
  background: #f7f7fc;
  position: relative;
  padding: 0.75rem 1rem 1rem;
}
.parcours-group.drag-over-before::before,
.parcours-group.drag-over-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--text-action-high-blue-france, #000091);
  border-radius: 2px;
  z-index: 5;
  pointer-events: none;
}
.parcours-group.drag-over-before::before {
  top: -10px;
}
.parcours-group.drag-over-after::after {
  bottom: -10px;
}
.parcours-group__head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.parcours-group__drag-handle {
  color: #888;
  cursor: grab;
  font-size: 1.1rem;
  padding: 0.2rem 0.3rem;
  flex-shrink: 0;
}
.parcours-group__drag-handle:active {
  cursor: grabbing;
  color: var(--text-action-high-blue-france, #000091);
}
.parcours-group__drag-handle--disabled {
  cursor: not-allowed;
  opacity: 0.35;
}
.parcours-group__toggle {
  flex-shrink: 0;
}
.parcours-group__title {
  flex: 1;
  display: flex;
  flex-direction: column;
}
:deep(.parcours-group__title-display) {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-action-high-blue-france, #000091);
}
:deep(.parcours-group__title-input) {
  font-size: 1.2rem;
  font-weight: 700;
}
.parcours-group__count {
  margin: 0;
  font-size: 0.8rem;
  color: #666;
}
.parcours-group__desc {
  margin: 0.4rem 0 0.8rem 2.6rem;
  color: #444;
  font-size: 0.9rem;
}
.parcours-group__stories {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.25rem 0 0.25rem 0;
  min-height: 1rem;
}
.parcours-group__add-story {
  align-self: flex-start;
  margin-top: 0.25rem;
}
.story-drop-wrap {
  position: relative;
}
.story-drop-wrap[draggable='true'] {
  cursor: default;
}
.story-drop-wrap.drag-over-before::before,
.story-drop-wrap.drag-over-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--text-action-high-blue-france, #000091);
  border-radius: 2px;
  z-index: 5;
  pointer-events: none;
}
.story-drop-wrap.drag-over-before::before {
  top: -6px;
}
.story-drop-wrap.drag-over-after::after {
  bottom: -6px;
}
</style>
