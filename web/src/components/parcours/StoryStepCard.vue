<script setup lang="ts">
// Une carte d'écran dans le fil de fer d'un parcours.
//
// Structure :
//   - En-tête : pastille kind + label de l'écran + bouton "changer"
//   - Corps : 2 zones InlineEdit — action utilisateur + commentaires
//   - Bouton "supprimer" (poubelle) et "branche" (Phase C)
//
// L'écran est passé en entier, c'est le parent qui résout les refs vers les
// labels lisibles (node → label de node, dispositif → name, etc.) et les
// fournit via `screenLabel`.

import { computed } from 'vue';
import type { Screen, LeafStep } from '@latelier/shared';
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
}>();

const emit = defineEmits<{
  (e: 'update:action', v: string): void;
  (e: 'update:comment', v: string): void;
  (e: 'change-screen'): void;
  (e: 'add-branch'): void;
  (e: 'remove'): void;
  (e: 'edit-attempt'): void;
}>();

const screen = computed<Screen>(() => props.step.screen);
const style = computed(() => KIND_STYLES[screen.value.kind]);
</script>

<template>
  <article class="step-card" :style="{ borderTop: `4px solid ${style.accent}` }">
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
        >
          Branche
        </button>
        <button
          type="button"
          class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line"
          title="Supprimer l'étape"
          :disabled="!canEdit"
          @click="emit('remove')"
        >
          Supprimer
        </button>
      </div>
    </header>
    <div class="step-card__body">
      <div class="step-card__field">
        <span class="step-card__label">Action utilisateur</span>
        <InlineEdit
          :value="step.action"
          placeholder="Que doit faire l'utilisateur sur cet écran ?"
          :textarea="true"
          :rows="2"
          :can-edit="canEdit"
          @update="(v) => emit('update:action', v)"
          @edit-attempt="emit('edit-attempt')"
        />
      </div>
      <div class="step-card__field">
        <span class="step-card__label">Commentaires</span>
        <InlineEdit
          :value="step.comment"
          placeholder="Doutes, craintes, points d'attention…"
          :textarea="true"
          :rows="2"
          :can-edit="canEdit"
          @update="(v) => emit('update:comment', v)"
          @edit-attempt="emit('edit-attempt')"
        />
      </div>
    </div>
  </article>
</template>

<style scoped>
.step-card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  min-width: 280px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.step-card__head {
  padding: 0.6rem 0.75rem;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}
.step-card__kind {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  background: none;
  flex-shrink: 0;
}
.step-card__kind:disabled {
  cursor: default;
}
.step-card__kind-label {
  font-weight: 600;
}
.step-card__title {
  flex: 1;
  font-size: 0.95rem;
  line-height: 1.3;
  min-width: 0;
  word-break: break-word;
}
.step-card__subtitle {
  display: block;
  font-size: 0.75rem;
  color: #777;
  font-weight: 400;
}
.step-card__tools {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex-shrink: 0;
}
.step-card__tools .fr-btn {
  font-size: 0.7rem;
  padding: 0.15rem 0.3rem;
}
.step-card__body {
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.step-card__field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.step-card__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #777;
  font-weight: 600;
}
</style>
