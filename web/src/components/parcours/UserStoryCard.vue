<script setup lang="ts">
// Une user story = un bandeau d'en-tête compact (handle + label +
// description inline + audience + delete + toggle) sur 1 ligne, puis
// le rail d'étapes en dessous (visible si non-collapsed).
//
// Émet `update` pour toute mutation, le parent reconstitue la data.

import { computed } from 'vue';
import type { UserStory, Screen, Step, VocabEntry } from '@latelier/shared';
import InlineEdit from '../ui/InlineEdit.vue';
import StoryStepRail from './StoryStepRail.vue';

interface ResolvedScreen {
  label: string;
  subtitle?: string;
}

const props = defineProps<{
  readonly story: UserStory;
  readonly canEdit: boolean;
  readonly audiences: readonly VocabEntry[];
  readonly themes: readonly VocabEntry[];
  readonly resolveScreen: (s: Screen) => ResolvedScreen;
}>();

const emit = defineEmits<{
  (e: 'update', patch: Partial<UserStory>): void;
  (e: 'remove'): void;
  (e: 'pick-screen', stepId: string, branchId: string | null, subStepId: string | null): void;
  (e: 'edit-attempt'): void;
  (e: 'open-entity', screen: Screen): void;
  (
    e: 'cross-move',
    payload: {
      sourceStoryId: string;
      sourceStepId: string;
      targetStepId: string;
      mode: 'before' | 'after';
    },
  ): void;
}>();

function onLabelUpdate(v: string): void {
  emit('update', { label: v });
}
function onDescUpdate(v: string): void {
  emit('update', { description: v });
}
function onAudienceChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  emit('update', { audience_key: v || null });
}
function onStepsChange(next: Step[]): void {
  emit('update', { steps: next });
}

const open = computed(() => !props.story.collapsed);

function toggleOpen(): void {
  emit('update', { collapsed: !props.story.collapsed });
}

const stepCount = computed(() => {
  const top = props.story.steps.length;
  const sub = props.story.steps.reduce(
    (n, s) => n + (s.branches ?? []).reduce((m, b) => m + b.steps.length, 0),
    0,
  );
  return top + sub;
});
</script>

<template>
  <article class="story-card">
    <header class="story-card__head">
      <span
        class="story-card__drag-handle fr-icon-drag-move-2-line"
        :class="{ 'story-card__drag-handle--disabled': !canEdit }"
        aria-hidden="true"
        :title="
          canEdit ? 'Glisser pour déplacer la user story' : 'Activer l\'édition pour déplacer'
        "
        @click="canEdit ? null : emit('edit-attempt')"
      ></span>
      <button
        type="button"
        class="story-card__toggle fr-btn fr-btn--tertiary-no-outline fr-btn--sm"
        :class="open ? 'fr-icon-arrow-down-s-line' : 'fr-icon-arrow-right-s-line'"
        :title="open ? 'Replier le parcours' : 'Déplier le parcours'"
        @click="toggleOpen"
      ></button>
      <div class="story-card__label">
        <InlineEdit
          :value="story.label"
          placeholder="Libellé de la user story"
          display-class="story-card__label-display"
          input-class="story-card__label-input"
          :can-edit="canEdit"
          @update="onLabelUpdate"
          @edit-attempt="emit('edit-attempt')"
        />
      </div>
      <div class="story-card__desc">
        <InlineEdit
          :value="story.description ?? ''"
          placeholder="Description courte — facultatif"
          :can-edit="canEdit"
          display-class="story-card__desc-display"
          input-class="story-card__desc-input"
          @update="onDescUpdate"
          @edit-attempt="emit('edit-attempt')"
        />
      </div>
      <span class="story-card__count"> {{ stepCount }} étape{{ stepCount > 1 ? 's' : '' }} </span>
      <label class="story-card__audience">
        <select
          class="fr-select fr-select--sm"
          :value="story.audience_key ?? ''"
          :disabled="!canEdit"
          :title="`Public cible`"
          @change="onAudienceChange"
        >
          <option value="">— Tout public</option>
          <option v-for="a in audiences" :key="a.key" :value="a.key">{{ a.label }}</option>
        </select>
      </label>
      <button
        type="button"
        class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line"
        :disabled="!canEdit"
        :title="canEdit ? 'Supprimer cette user story' : 'Activer l\'édition pour supprimer'"
        @click="canEdit ? emit('remove') : emit('edit-attempt')"
      ></button>
    </header>

    <div v-if="open" class="story-card__rail">
      <StoryStepRail
        :story-id="story.id"
        :steps="story.steps"
        :can-edit="canEdit"
        :themes="themes"
        :resolve-screen="resolveScreen"
        @change="onStepsChange"
        @pick-screen="
          (stepId, branchId, subStepId) => emit('pick-screen', stepId, branchId, subStepId)
        "
        @open-entity="(screen) => emit('open-entity', screen)"
        @cross-move="(payload) => emit('cross-move', payload)"
        @edit-attempt="emit('edit-attempt')"
      />
    </div>
  </article>
</template>

<style scoped>
.story-card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.story-card__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: nowrap;
  min-width: 0;
}
.story-card__drag-handle {
  color: #999;
  cursor: grab;
  font-size: 1rem;
  padding: 0.1rem 0.25rem;
  flex-shrink: 0;
}
.story-card__drag-handle:active {
  cursor: grabbing;
  color: var(--text-action-high-blue-france, #000091);
}
.story-card__drag-handle--disabled {
  cursor: not-allowed;
  opacity: 0.35;
}
.story-card__toggle {
  flex-shrink: 0;
  padding: 0.15rem 0.3rem !important;
}
.story-card__label {
  flex: 1 0 12rem;
  min-width: 8rem;
}
:deep(.story-card__label-display) {
  font-size: 1rem;
  font-weight: 600;
  color: #161616;
}
:deep(.story-card__label-input) {
  font-size: 1rem;
  font-weight: 600;
}
.story-card__desc {
  flex: 2 1 14rem;
  min-width: 0;
  overflow: hidden;
}
:deep(.story-card__desc-display) {
  font-size: 0.85rem;
  color: #666;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  max-width: 100%;
}
:deep(.story-card__desc-input) {
  font-size: 0.85rem;
}
.story-card__count {
  font-size: 0.75rem;
  color: #888;
  white-space: nowrap;
  flex-shrink: 0;
}
.story-card__audience {
  flex-shrink: 0;
}
.story-card__audience select {
  font-size: 0.8rem;
  padding: 0.15rem 0.4rem;
  max-width: 9rem;
}
.story-card__head .fr-btn--sm {
  padding: 0.15rem 0.3rem;
}
.story-card__rail {
  margin-top: 0.25rem;
}
</style>
