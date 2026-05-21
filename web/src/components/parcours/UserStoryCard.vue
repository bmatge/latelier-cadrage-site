<script setup lang="ts">
// Une user story = un bandeau d'en-tête (label + audience + theme) +
// accordéon "Parcours" replié/déplié.
//
// Émet `update` pour toute mutation : label, audience_key, theme_key,
// description, steps. Le parent (ProjectParcoursPage) reconstitue la
// data complète et la commit au store.

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
  /** Drop venu d'une autre story — relayé tel quel vers la page parente. */
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

const audienceLabel = computed(
  () => props.audiences.find((a) => a.key === props.story.audience_key)?.label ?? '—',
);

const stepCount = computed(() => {
  const top = props.story.steps.length;
  const sub = props.story.steps.reduce(
    (n, s) => n + (s.branches ?? []).reduce((m, b) => m + b.steps.length, 0),
    0,
  );
  return top + sub;
});

const open = computed(() => !props.story.collapsed);

function onToggle(e: Event): void {
  const next = (e.target as HTMLDetailsElement).open;
  if (next === open.value) return;
  emit('update', { collapsed: !next });
}
</script>

<template>
  <article class="story-card">
    <header class="story-card__head">
      <span
        v-if="canEdit"
        class="story-card__drag-handle fr-icon-drag-move-2-line"
        aria-hidden="true"
        title="Glisser pour déplacer la user story"
      ></span>
      <div class="story-card__title">
        <InlineEdit
          :value="story.label"
          placeholder="Libellé de la user story"
          display-class="story-card__title-display"
          input-class="story-card__title-input"
          :can-edit="canEdit"
          @update="onLabelUpdate"
          @edit-attempt="emit('edit-attempt')"
        />
      </div>
      <div class="story-card__meta">
        <label class="story-card__field">
          <span>Public</span>
          <select
            class="fr-select fr-select--sm"
            :value="story.audience_key ?? ''"
            :disabled="!canEdit"
            @change="onAudienceChange"
          >
            <option value="">—</option>
            <option v-for="a in audiences" :key="a.key" :value="a.key">{{ a.label }}</option>
          </select>
        </label>
        <button
          v-if="canEdit"
          type="button"
          class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line"
          title="Supprimer cette user story"
          @click="emit('remove')"
        >
          Supprimer
        </button>
      </div>
    </header>

    <div class="story-card__summary">
      <InlineEdit
        :value="story.description ?? ''"
        placeholder="Description courte (intention, contexte) — facultatif"
        :textarea="true"
        :rows="2"
        :can-edit="canEdit"
        @update="onDescUpdate"
        @edit-attempt="emit('edit-attempt')"
      />
    </div>

    <details class="story-card__details" :open="open" @toggle="onToggle">
      <summary class="story-card__summary-row">
        <span class="fr-icon-road-map-line fr-icon--sm" aria-hidden="true"></span>
        Parcours
        <span class="story-card__counts">
          {{ stepCount }} étape{{ stepCount > 1 ? 's' : '' }}
          <template v-if="audienceLabel !== '—'">· {{ audienceLabel }}</template>
        </span>
      </summary>
      <div class="story-card__rail">
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
          @cross-move="(payload) => emit('cross-move', payload)"
          @edit-attempt="emit('edit-attempt')"
        />
      </div>
    </details>
  </article>
</template>

<style scoped>
.story-card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.story-card__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
.story-card__drag-handle {
  color: #999;
  cursor: grab;
  font-size: 1.1rem;
  padding: 0.25rem 0.4rem 0.25rem 0;
  align-self: center;
  flex-shrink: 0;
}
.story-card__drag-handle:active {
  cursor: grabbing;
  color: var(--text-action-high-blue-france, #000091);
}
.story-card__title {
  flex: 1;
  min-width: 200px;
}
.story-card__title-display {
  font-size: 1.15rem;
  font-weight: 600;
  color: #161616;
}
.story-card__title-input {
  font-size: 1.15rem;
  font-weight: 600;
}
.story-card__meta {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  flex-wrap: wrap;
}
.story-card__field {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  color: #666;
  gap: 0.15rem;
}
.story-card__field select {
  min-width: 8rem;
  padding: 0.2rem 0.4rem;
  font-size: 0.85rem;
}
.story-card__summary {
  color: #444;
}
.story-card__details {
  border-top: 1px solid #eee;
  padding-top: 0.5rem;
}
.story-card__summary-row {
  cursor: pointer;
  font-weight: 600;
  color: #000091;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  list-style: none;
  padding: 0.3rem 0;
}
.story-card__summary-row::-webkit-details-marker {
  display: none;
}
.story-card__summary-row::before {
  content: '▸';
  display: inline-block;
  transition: transform 0.15s;
  color: #000091;
}
.story-card__details[open] .story-card__summary-row::before {
  transform: rotate(90deg);
}
.story-card__counts {
  color: #777;
  font-weight: 400;
  font-size: 0.85rem;
  margin-left: auto;
}
.story-card__rail {
  margin-top: 0.5rem;
}
</style>
