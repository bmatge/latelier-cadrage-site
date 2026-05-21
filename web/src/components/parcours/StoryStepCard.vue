<script setup lang="ts">
// Une carte d'écran dans le fil de fer d'un parcours.
//
// Structure compacte :
//   - En-tête : pastille kind (clic = picker) + sélecteur thème + label
//     de l'écran + boutons outils
//   - Corps : action utilisateur + commentaires (single-line par défaut,
//     extension vertical par contenu)
//
// L'écran est passé en entier, c'est le parent qui résout les refs vers
// les labels lisibles et les fournit via `screenLabel`/`screenSubtitle`.

import { computed } from 'vue';
import type { Screen, LeafStep, VocabEntry } from '@latelier/shared';
import InlineEdit from '../ui/InlineEdit.vue';
import { KIND_STYLES } from './screen-kinds.js';

const props = defineProps<{
  readonly step: LeafStep;
  readonly canEdit: boolean;
  readonly screenLabel: string;
  /** Affichage "X » Y" pour un screen=block (X = node, Y = code paragraph). */
  readonly screenSubtitle?: string | undefined;
  /** Désactive les boutons branche (utilisé dans les leaf steps des branches). */
  readonly noBranches?: boolean | undefined;
  /** Thèmes disponibles pour le sélecteur (vocab.story_themes). */
  readonly themes: readonly VocabEntry[];
}>();

const emit = defineEmits<{
  (e: 'update:action', v: string): void;
  (e: 'update:comment', v: string): void;
  (e: 'update:theme', v: string | null): void;
  (e: 'change-screen'): void;
  (e: 'add-branch'): void;
  (e: 'remove'): void;
  (e: 'edit-attempt'): void;
}>();

const screen = computed<Screen>(() => props.step.screen);
const style = computed(() => KIND_STYLES[screen.value.kind]);
const themeKey = computed(() => screen.value.theme_key ?? '');

function onThemeChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  emit('update:theme', v || null);
}
</script>

<template>
  <article class="step-card" :style="{ borderTop: `3px solid ${style.accent}` }">
    <header class="step-card__head">
      <button
        type="button"
        class="step-card__kind"
        :title="canEdit ? 'Changer l\'écran' : undefined"
        :style="{
          background: style.bg,
          color: style.accent,
          border: style.border,
        }"
        :disabled="!canEdit"
        @click="canEdit ? emit('change-screen') : emit('edit-attempt')"
      >
        <span :class="style.icon" class="fr-icon--sm" aria-hidden="true"></span>
        <span class="step-card__kind-label">{{ style.label }}</span>
      </button>
      <div class="step-card__title">
        <strong>{{ screenLabel || 'Sans titre' }}</strong>
        <span v-if="screenSubtitle" class="step-card__subtitle">{{ screenSubtitle }}</span>
      </div>
      <div class="step-card__tools">
        <button
          v-if="!noBranches"
          type="button"
          class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-git-branch-line"
          title="Ajouter une branche conditionnelle"
          :disabled="!canEdit"
          @click="emit('add-branch')"
        ></button>
        <button
          type="button"
          class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line"
          title="Supprimer l'étape"
          :disabled="!canEdit"
          @click="emit('remove')"
        ></button>
      </div>
    </header>
    <div class="step-card__body">
      <label class="step-card__theme">
        <span class="step-card__theme-label">Thème :</span>
        <select
          class="step-card__theme-select"
          :value="themeKey"
          :disabled="!canEdit"
          @change="onThemeChange"
        >
          <option value="">—</option>
          <option v-for="t in themes" :key="t.key" :value="t.key">{{ t.label }}</option>
        </select>
      </label>
      <InlineEdit
        :value="step.action"
        placeholder="Action utilisateur…"
        :textarea="true"
        :rows="1"
        :can-edit="canEdit"
        display-class="step-card__line"
        input-class="step-card__line-input"
        @update="(v) => emit('update:action', v)"
        @edit-attempt="emit('edit-attempt')"
      />
      <InlineEdit
        :value="step.comment"
        placeholder="Commentaires…"
        :textarea="true"
        :rows="1"
        :can-edit="canEdit"
        display-class="step-card__line step-card__line--muted"
        input-class="step-card__line-input"
        @update="(v) => emit('update:comment', v)"
        @edit-attempt="emit('edit-attempt')"
      />
    </div>
  </article>
</template>

<style scoped>
.step-card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  min-width: 220px;
  max-width: 260px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.step-card__head {
  padding: 0.4rem 0.55rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}
.step-card__kind {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  background: none;
  flex-shrink: 0;
}
.step-card__kind:disabled {
  cursor: default;
}
.step-card__title {
  flex: 1;
  font-size: 0.85rem;
  line-height: 1.25;
  min-width: 0;
  word-break: break-word;
}
.step-card__subtitle {
  display: block;
  font-size: 0.7rem;
  color: #777;
  font-weight: 400;
}
.step-card__tools {
  display: flex;
  gap: 0.1rem;
  flex-shrink: 0;
}
.step-card__tools .fr-btn {
  padding: 0.1rem 0.2rem;
}
.step-card__body {
  padding: 0.45rem 0.55rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
}
.step-card__theme {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: #666;
}
.step-card__theme-label {
  flex-shrink: 0;
}
.step-card__theme-select {
  flex: 1;
  font-size: 0.75rem;
  padding: 0.1rem 0.3rem;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #fff;
  min-width: 0;
}
.step-card :deep(.step-card__line) {
  font-size: 0.85rem;
  line-height: 1.3;
}
.step-card :deep(.step-card__line--muted) {
  color: #666;
  font-style: italic;
}
.step-card :deep(.step-card__line-input) {
  font-size: 0.85rem;
}
</style>
