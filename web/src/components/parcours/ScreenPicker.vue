<script setup lang="ts">
// Modal full-screen pour choisir le `screen` d'un step. 4 onglets — un
// par kind. La sélection émet `update` avec le nouveau Screen.
//
// Pour l'onglet Page : liste à plat les nodes de l'arbo (label + chemin).
// Pour l'onglet Bloc : sélection du node parent puis du paragraph dans
// ce node (2 niveaux).
// Pour l'onglet Sortie : liste les dispositifs du catalogue.
// Pour l'onglet Indéfini : saisit titre + description libre.
//
// Le bouton "Promouvoir vers" en bas reste en Phase C (création de l'entité
// référente). En Phase B, on ne fait que de la sélection vers l'existant.

import { computed, ref, watch } from 'vue';
import type { Screen, ScreenKind } from '@latelier/shared';
import { blockRef } from '@latelier/shared';
import BaseModal from '../ui/BaseModal.vue';
import { KIND_STYLES } from './screen-kinds.js';
import type { TreeNode } from '../../stores/tree.js';

interface DispositifLite {
  id: string;
  name: string;
  description?: string;
}

interface ParagraphLite {
  id: string;
  code: string;
  data?: unknown;
}

const props = defineProps<{
  readonly open: boolean;
  readonly current: Screen;
  readonly tree: TreeNode | null;
  readonly dispositifs: readonly DispositifLite[];
  readonly nodeMaquettes: ReadonlyMap<string, readonly ParagraphLite[]>;
}>();

const emit = defineEmits<{
  (e: 'update', screen: Screen): void;
  (e: 'close'): void;
}>();

const activeKind = ref<ScreenKind>(props.current.kind);
watch(
  () => props.open,
  (o) => {
    if (o) activeKind.value = props.current.kind;
  },
);

// Aplatissement de l'arbre pour les onglets node/block
interface FlatNode {
  id: string;
  label: string;
  path: string;
  depth: number;
}
const flatNodes = computed<FlatNode[]>(() => {
  const out: FlatNode[] = [];
  if (!props.tree) return out;
  const walk = (n: TreeNode, depth: number, path: string[]): void => {
    const nextPath = [...path, n.label];
    out.push({ id: n.id, label: n.label, path: nextPath.join(' › '), depth });
    for (const c of n.children ?? []) walk(c, depth + 1, nextPath);
  };
  walk(props.tree, 0, []);
  return out;
});

// Recherche
const searchNode = ref('');
const searchBlockNode = ref('');
const searchDisp = ref('');
const ghostTitle = ref(props.current.title ?? '');
const ghostDesc = ref(props.current.description ?? '');
const selectedNodeForBlock = ref<string | null>(null);

watch(
  () => props.open,
  (o) => {
    if (o) {
      ghostTitle.value = props.current.title ?? '';
      ghostDesc.value = props.current.description ?? '';
      searchNode.value = '';
      searchBlockNode.value = '';
      searchDisp.value = '';
      selectedNodeForBlock.value = null;
    }
  },
);

const filteredNodes = computed(() => {
  const q = searchNode.value.trim().toLowerCase();
  if (!q) return flatNodes.value;
  return flatNodes.value.filter(
    (n) => n.label.toLowerCase().includes(q) || n.path.toLowerCase().includes(q),
  );
});

const filteredNodesForBlock = computed(() => {
  const q = searchBlockNode.value.trim().toLowerCase();
  const list = flatNodes.value.filter((n) => (props.nodeMaquettes.get(n.id) ?? []).length > 0);
  if (!q) return list;
  return list.filter((n) => n.label.toLowerCase().includes(q) || n.path.toLowerCase().includes(q));
});

const paragraphsOfSelectedNode = computed<readonly ParagraphLite[]>(() => {
  const id = selectedNodeForBlock.value;
  if (!id) return [];
  return props.nodeMaquettes.get(id) ?? [];
});

const filteredDispositifs = computed(() => {
  const q = searchDisp.value.trim().toLowerCase();
  if (!q) return props.dispositifs;
  return props.dispositifs.filter(
    (d) => d.name.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q),
  );
});

function pickNode(n: FlatNode): void {
  emit('update', { kind: 'node', ref: n.id, title: n.label });
  emit('close');
}

function pickBlock(nodeId: string, paragraphId: string, code: string): void {
  emit('update', { kind: 'block', ref: blockRef(nodeId, paragraphId), title: code });
  emit('close');
}

function pickDispositif(d: DispositifLite): void {
  emit('update', { kind: 'dispositif', ref: d.id, title: d.name });
  emit('close');
}

function applyGhost(): void {
  emit('update', {
    kind: 'ghost',
    ref: null,
    title: ghostTitle.value.trim(),
    description: ghostDesc.value.trim(),
  });
  emit('close');
}

function getNodeLabel(id: string): string {
  return flatNodes.value.find((n) => n.id === id)?.label ?? id;
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Choisir un écran"
    subtitle="Page, bloc ou ressource externe — ou laisser indéfini pour l'instant."
    size="lg"
    @close="emit('close')"
  >
    <div class="screen-picker">
      <nav class="screen-picker__tabs" role="tablist">
        <button
          v-for="k in ['ghost', 'node', 'block', 'dispositif'] as ScreenKind[]"
          :key="k"
          type="button"
          role="tab"
          :aria-selected="activeKind === k"
          class="fr-btn fr-btn--tertiary fr-btn--sm"
          :class="{ 'screen-picker__tab--active': activeKind === k }"
          @click="activeKind = k"
        >
          <span :class="KIND_STYLES[k].icon" class="fr-icon--sm tab-icon" aria-hidden="true"></span>
          {{ KIND_STYLES[k].label }}
        </button>
      </nav>

      <!-- Ghost / Indéfini -->
      <section v-if="activeKind === 'ghost'" class="screen-picker__pane">
        <p class="hint">
          Note libre — typique en atelier quand on ne sait pas encore s'il s'agira d'une page
          existante, d'un bloc, ou d'un service externe.
        </p>
        <label class="fr-label">
          Titre
          <input
            v-model="ghostTitle"
            type="text"
            class="fr-input"
            placeholder="Ex : Page contact"
          />
        </label>
        <label class="fr-label">
          Description (optionnelle)
          <textarea
            v-model="ghostDesc"
            class="fr-input"
            rows="3"
            placeholder="Ce qu'on veut y trouver, ses objectifs…"
          ></textarea>
        </label>
        <div class="screen-picker__actions">
          <button type="button" class="fr-btn" :disabled="!ghostTitle.trim()" @click="applyGhost">
            Enregistrer
          </button>
        </div>
      </section>

      <!-- Node / Page -->
      <section v-else-if="activeKind === 'node'" class="screen-picker__pane">
        <input
          v-model="searchNode"
          type="search"
          class="fr-input"
          placeholder="Rechercher une page…"
        />
        <ul v-if="filteredNodes.length" class="screen-picker__list">
          <li v-for="n in filteredNodes" :key="n.id">
            <button type="button" class="picker-row" @click="pickNode(n)">
              <span class="picker-row__label">
                <span v-for="d in n.depth" :key="d" class="picker-row__indent"></span>
                {{ n.label }}
              </span>
              <span class="picker-row__path">{{ n.path }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="hint">Aucune page ne correspond.</p>
      </section>

      <!-- Block -->
      <section v-else-if="activeKind === 'block'" class="screen-picker__pane">
        <p class="hint">
          1. Choisir une page parmi celles qui ont une maquette posée. 2. Choisir le bloc.
        </p>
        <input
          v-model="searchBlockNode"
          type="search"
          class="fr-input"
          placeholder="Rechercher une page…"
        />
        <div class="screen-picker__split">
          <ul class="screen-picker__list">
            <li v-for="n in filteredNodesForBlock" :key="n.id">
              <button
                type="button"
                class="picker-row"
                :class="{ 'picker-row--active': selectedNodeForBlock === n.id }"
                @click="selectedNodeForBlock = n.id"
              >
                <span class="picker-row__label">{{ n.label }}</span>
                <span class="picker-row__path">{{ n.path }}</span>
              </button>
            </li>
            <li v-if="!filteredNodesForBlock.length" class="hint">
              Aucune page avec maquette posée.
            </li>
          </ul>
          <ul v-if="selectedNodeForBlock" class="screen-picker__list">
            <li v-for="p in paragraphsOfSelectedNode" :key="p.id">
              <button
                type="button"
                class="picker-row"
                @click="pickBlock(selectedNodeForBlock!, p.id, p.code)"
              >
                <span class="picker-row__label">
                  <span class="fr-icon-stack-line fr-icon--sm" aria-hidden="true"></span>
                  {{ p.code }}
                </span>
                <span class="picker-row__path">{{ getNodeLabel(selectedNodeForBlock!) }}</span>
              </button>
            </li>
          </ul>
        </div>
      </section>

      <!-- Dispositif / Sortie externe -->
      <section v-else class="screen-picker__pane">
        <p class="hint">
          Ressources et services externes (FranceConnect, démarches-simplifiées,
          mon-compte-formation…). L'utilisateur sort du site.
        </p>
        <input
          v-model="searchDisp"
          type="search"
          class="fr-input"
          placeholder="Rechercher une ressource…"
        />
        <ul v-if="filteredDispositifs.length" class="screen-picker__list">
          <li v-for="d in filteredDispositifs" :key="d.id">
            <button type="button" class="picker-row" @click="pickDispositif(d)">
              <span class="picker-row__label">
                <span class="fr-icon-external-link-line fr-icon--sm" aria-hidden="true"></span>
                {{ d.name }}
              </span>
              <span v-if="d.description" class="picker-row__path">{{ d.description }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="hint">Aucune ressource ne correspond.</p>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.screen-picker {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.screen-picker__tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  border-bottom: 1px solid #ddd;
  padding-bottom: 0.75rem;
}
.screen-picker__tab--active {
  background: var(--background-alt-blue-france, #e3e3fd) !important;
  color: var(--text-action-high-blue-france, #000091) !important;
  font-weight: 600;
}
.tab-icon {
  margin-right: 0.3rem;
}
.screen-picker__pane {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 320px;
}
.hint {
  color: #666;
  font-size: 0.9rem;
  margin: 0;
}
.screen-picker__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
}
.screen-picker__list li {
  border-bottom: 1px solid #f3f3f3;
}
.screen-picker__list li:last-child {
  border-bottom: none;
}
.screen-picker__split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.picker-row {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0.6rem 0.8rem;
  cursor: pointer;
}
.picker-row:hover {
  background: #f7f7ff;
}
.picker-row--active {
  background: var(--background-alt-blue-france, #e3e3fd);
}
.picker-row__label {
  display: block;
  font-weight: 500;
  color: #161616;
}
.picker-row__indent {
  display: inline-block;
  width: 0.8rem;
}
.picker-row__path {
  display: block;
  font-size: 0.8rem;
  color: #777;
  margin-top: 0.15rem;
}
.screen-picker__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.5rem;
}
.fr-label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-weight: 500;
}
</style>
