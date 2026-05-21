<script setup lang="ts">
// Page Parcours : liste verticale des user stories d'un projet, chacune
// avec son fil de fer d'étapes (kind ghost/node/block/dispositif).
//
// Persistance : `project_data.user_stories` via useUserStoriesStore.
// Autosave : chaque mutation appelle store.save() (debounce naturel via
// le pattern Pinia : setData → save).
//
// Vocab : audience_key issue de `vocab.audiences`, theme_key de
// `vocab.story_themes` (avec fallback DEFAULT_STORY_THEMES).

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  DEFAULT_STORY_THEMES,
  LEGACY_VOCAB,
  normalizeUserStories,
  parseBlockRef,
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

// Dispositifs : on extrait juste id/name/description pour le picker.
const dispositifs = computed<DispositifLite[]>(() => {
  const raw = dispStore.data as { dispositifs?: unknown[] } | null;
  if (!raw || !Array.isArray(raw.dispositifs)) return [];
  return (raw.dispositifs as Array<Record<string, unknown>>).map((d) => ({
    id: String(d['id'] ?? ''),
    name: String(d['name'] ?? d['id'] ?? ''),
    description: typeof d['description'] === 'string' ? (d['description'] as string) : '',
  }));
});

// Index nodes par id pour résoudre les screens
const nodeIndex = computed<Map<string, TreeNode>>(() => {
  const out = new Map<string, TreeNode>();
  const walk = (n: TreeNode): void => {
    out.set(n.id, n);
    for (const c of n.children ?? []) walk(c);
  };
  if (treeStore.tree) walk(treeStore.tree);
  return out;
});

// Index des paragraphs par nodeId (pour le picker block)
const paragraphsByNode = computed<Map<string, ParagraphLite[]>>(() => {
  const out = new Map<string, ParagraphLite[]>();
  const walk = (n: TreeNode): void => {
    const maquette = n['maquette'] as
      | { paragraphs?: Array<{ id?: unknown; code?: unknown }> }
      | undefined;
    const list = Array.isArray(maquette?.paragraphs) ? maquette!.paragraphs! : [];
    const cleaned: ParagraphLite[] = [];
    for (const p of list) {
      if (typeof p?.id === 'string' && typeof p?.code === 'string') {
        cleaned.push({ id: p.id, code: p.code });
      }
    }
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
  // dispositif
  const d = s.ref ? dispositifs.value.find((x) => x.id === s.ref) : null;
  if (d) return { label: d.name, subtitle: 'Sortie externe' };
  return { label: s.title || s.ref || 'Ressource introuvable', subtitle: 'Sortie (lien rompu)' };
}

// ----- mutations -----

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

function cloneStories(): UserStory[] {
  return JSON.parse(JSON.stringify(data.value.stories)) as UserStory[];
}

function addStory(): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStories();
  next.push({
    id: newId('us'),
    label: 'Nouvelle user story',
    audience_key: null,
    theme_key: null,
    description: '',
    steps: [],
  });
  void commit({ stories: next });
}

function updateStory(id: string, patch: Partial<UserStory>): void {
  if (!ensureEditOrModal()) return;
  const next = cloneStories();
  const i = next.findIndex((s) => s.id === id);
  if (i < 0) return;
  next[i] = { ...next[i]!, ...patch };
  void commit({ stories: next });
}

async function removeStory(id: string): Promise<void> {
  if (!ensureEditOrModal()) return;
  const story = data.value.stories.find((s) => s.id === id);
  if (!story) return;
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
  void commit({ stories: cloneStories().filter((s) => s.id !== id) });
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
  const story = data.value.stories.find((s) => s.id === t.storyId);
  if (!story) return { kind: 'ghost', ref: null };
  if (t.branchId && t.subStepId) {
    const step = story.steps.find((s) => s.id === t.stepId);
    const branch = step?.branches?.find((b) => b.id === t.branchId);
    const sub = branch?.steps.find((s) => s.id === t.subStepId);
    return sub?.screen ?? { kind: 'ghost', ref: null };
  }
  return story.steps.find((s) => s.id === t.stepId)?.screen ?? { kind: 'ghost', ref: null };
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
  const next = cloneStories();
  const story = next.find((s) => s.id === t.storyId);
  if (!story) return;
  if (t.branchId && t.subStepId) {
    const step = story.steps.find((s) => s.id === t.stepId);
    const branch = step?.branches?.find((b) => b.id === t.branchId);
    const sub = branch?.steps.find((s) => s.id === t.subStepId);
    if (sub) (sub as { screen: Screen }).screen = screen;
  } else {
    const step = story.steps.find((s) => s.id === t.stepId);
    if (step) (step as { screen: Screen }).screen = screen;
  }
  void commit({ stories: next });
}

// Recherche
const search = ref('');
const filteredStories = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return data.value.stories;
  return data.value.stories.filter(
    (s) =>
      s.label.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      s.steps.some(
        (st) =>
          st.action.toLowerCase().includes(q) ||
          st.comment.toLowerCase().includes(q) ||
          (st.screen.title ?? '').toLowerCase().includes(q),
      ),
  );
});
</script>

<template>
  <section>
    <PageHeader
      title="Parcours utilisateur"
      subtitle="User stories — ce que les usagers viennent faire, et par quelles pages, blocs ou ressources externes ils passent."
    >
      <template #toolbar>
        <div class="parcours-toolbar">
          <input
            v-model="search"
            type="search"
            class="fr-input"
            placeholder="Rechercher dans les stories…"
          />
          <button
            v-if="canEdit"
            type="button"
            class="fr-btn fr-icon-add-line fr-btn--icon-left"
            @click="addStory"
          >
            Nouvelle user story
          </button>
        </div>
      </template>
    </PageHeader>

    <div v-if="storyStore.loading" class="loading">Chargement…</div>
    <div v-else-if="!data.stories.length" class="empty">
      <p>Aucune user story pour l'instant.</p>
      <p v-if="canEdit">
        Cliquez sur « Nouvelle user story » pour décrire une tâche que les usagers viennent
        accomplir sur le site, et le parcours qui en découle.
      </p>
    </div>
    <div v-else class="stories-list">
      <UserStoryCard
        v-for="story in filteredStories"
        :key="story.id"
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
        @edit-attempt="ensureEditOrModal"
      />
    </div>

    <ScreenPicker
      :open="pickerOpen"
      :current="pickerCurrent"
      :tree="treeStore.tree"
      :dispositifs="dispositifs"
      :node-maquettes="paragraphsByNode"
      @update="applyScreen"
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
  max-width: 280px;
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
.stories-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}
</style>
