<script setup lang="ts">
// Rail horizontal des étapes d'un parcours, avec rendu indenté des
// branches conditionnelles (profondeur 1).
//
// Émet des `change` granulaires pour chaque mutation. Le parent
// (`UserStoryCard`) reconstitue la story et la commit au store
// (autosave).

import type { Screen, Step } from '@latelier/shared';
import StoryStepCard from './StoryStepCard.vue';
import { newId } from './screen-kinds.js';
import InlineEdit from '../ui/InlineEdit.vue';

// Versions mutables (Step/Branch côté shared sont readonly) — on travaille
// en local sur des copies mutables puis on emit le résultat typé comme
// readonly Step[].
interface MLeafStep {
  id: string;
  screen: Screen;
  action: string;
  comment: string;
}
interface MBranch {
  id: string;
  condition: string;
  steps: MLeafStep[];
}
interface MStep extends MLeafStep {
  branches?: MBranch[];
}

interface ScreenResolver {
  (screen: Screen): { label: string; subtitle?: string };
}

const props = defineProps<{
  readonly steps: readonly Step[];
  readonly canEdit: boolean;
  readonly resolveScreen: ScreenResolver;
}>();

const emit = defineEmits<{
  (e: 'change', steps: Step[]): void;
  (e: 'pick-screen', stepId: string, branchId: string | null, subStepId: string | null): void;
  (e: 'edit-attempt'): void;
}>();

function cloneSteps(): MStep[] {
  return JSON.parse(JSON.stringify(props.steps)) as MStep[];
}

function emitChange(next: MStep[]): void {
  emit('change', next as unknown as Step[]);
}

function addStep(): void {
  const next = cloneSteps();
  next.push({
    id: newId('st'),
    screen: { kind: 'ghost', ref: null, title: 'Nouvel écran' },
    action: '',
    comment: '',
  });
  emitChange(next);
}

function removeStep(id: string): void {
  emitChange(cloneSteps().filter((s) => s.id !== id));
}

function moveStep(id: string, dir: -1 | 1): void {
  const next = cloneSteps();
  const i = next.findIndex((s) => s.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= next.length) return;
  const a = next[i];
  const b = next[j];
  if (!a || !b) return;
  next[i] = b;
  next[j] = a;
  emitChange(next);
}

function setStepField(id: string, field: 'action' | 'comment', v: string): void {
  const next = cloneSteps();
  const s = next.find((x) => x.id === id);
  if (s) {
    if (field === 'action') s.action = v;
    else s.comment = v;
  }
  emitChange(next);
}

function addBranch(stepId: string): void {
  const next = cloneSteps();
  const s = next.find((x) => x.id === stepId);
  if (!s) return;
  s.branches = [...(s.branches ?? []), { id: newId('b'), condition: 'Si …', steps: [] }];
  emitChange(next);
}

function removeBranch(stepId: string, branchId: string): void {
  const next = cloneSteps();
  const s = next.find((x) => x.id === stepId);
  if (!s) return;
  const list = (s.branches ?? []).filter((b) => b.id !== branchId);
  if (list.length) s.branches = list;
  else delete s.branches;
  emitChange(next);
}

function setBranchCondition(stepId: string, branchId: string, v: string): void {
  const next = cloneSteps();
  const b = next.find((x) => x.id === stepId)?.branches?.find((x) => x.id === branchId);
  if (b) b.condition = v;
  emitChange(next);
}

function addSubStep(stepId: string, branchId: string): void {
  const next = cloneSteps();
  const b = next.find((x) => x.id === stepId)?.branches?.find((x) => x.id === branchId);
  if (!b) return;
  const sub: MLeafStep = {
    id: newId('st'),
    screen: { kind: 'ghost', ref: null, title: 'Nouvel écran' },
    action: '',
    comment: '',
  };
  b.steps = [...b.steps, sub];
  emitChange(next);
}

function removeSubStep(stepId: string, branchId: string, subId: string): void {
  const next = cloneSteps();
  const b = next.find((x) => x.id === stepId)?.branches?.find((x) => x.id === branchId);
  if (!b) return;
  b.steps = b.steps.filter((s) => s.id !== subId);
  emitChange(next);
}

function setSubStepField(
  stepId: string,
  branchId: string,
  subId: string,
  field: 'action' | 'comment',
  v: string,
): void {
  const next = cloneSteps();
  const b = next.find((x) => x.id === stepId)?.branches?.find((x) => x.id === branchId);
  const sub = b?.steps.find((s) => s.id === subId);
  if (sub) {
    if (field === 'action') sub.action = v;
    else sub.comment = v;
  }
  emitChange(next);
}
</script>

<template>
  <div class="rail">
    <div class="rail__row">
      <template v-for="(step, idx) in steps" :key="step.id">
        <span v-if="idx > 0" class="rail__arrow" aria-hidden="true">→</span>
        <div class="rail__step-wrap">
          <div class="rail__nav">
            <button
              v-if="canEdit"
              type="button"
              class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-arrow-left-line"
              :disabled="idx === 0"
              title="Déplacer à gauche"
              @click="moveStep(step.id, -1)"
            ></button>
            <button
              v-if="canEdit"
              type="button"
              class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-arrow-right-line"
              :disabled="idx === steps.length - 1"
              title="Déplacer à droite"
              @click="moveStep(step.id, 1)"
            ></button>
          </div>
          <StoryStepCard
            :step="step"
            :can-edit="canEdit"
            :screen-label="resolveScreen(step.screen).label"
            :screen-subtitle="resolveScreen(step.screen).subtitle"
            @update:action="(v) => setStepField(step.id, 'action', v)"
            @update:comment="(v) => setStepField(step.id, 'comment', v)"
            @change-screen="emit('pick-screen', step.id, null, null)"
            @add-branch="addBranch(step.id)"
            @remove="removeStep(step.id)"
            @edit-attempt="emit('edit-attempt')"
          />
        </div>
      </template>
      <button
        v-if="canEdit"
        type="button"
        class="rail__add fr-btn fr-btn--tertiary fr-icon-add-line fr-btn--icon-left"
        @click="addStep"
      >
        Étape
      </button>
    </div>

    <!-- Sous-rails de branches indentés sous le rail principal -->
    <div v-for="step in steps" :key="`b-${step.id}`">
      <template v-if="(step.branches ?? []).length">
        <div class="rail__branches">
          <div
            v-for="branch in step.branches"
            :key="branch.id"
            class="rail__branch"
            :style="{
              '--branch-anchor': `« ${step.screen.title || resolveScreen(step.screen).label} »`,
            }"
          >
            <header class="rail__branch-head">
              <span class="fr-icon-git-branch-line fr-icon--sm" aria-hidden="true"></span>
              <InlineEdit
                :value="branch.condition"
                placeholder="Si … (condition de bifurcation)"
                :can-edit="canEdit"
                input-class="rail__branch-cond"
                @update="(v) => setBranchCondition(step.id, branch.id, v)"
                @edit-attempt="emit('edit-attempt')"
              />
              <span class="rail__branch-from"
                >après « {{ step.screen.title || resolveScreen(step.screen).label }} »</span
              >
              <button
                type="button"
                class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line"
                :disabled="!canEdit"
                @click="removeBranch(step.id, branch.id)"
              >
                Supprimer la branche
              </button>
            </header>
            <div class="rail__row rail__row--sub">
              <template v-for="(sub, j) in branch.steps" :key="sub.id">
                <span v-if="j > 0" class="rail__arrow" aria-hidden="true">→</span>
                <StoryStepCard
                  :step="sub"
                  :can-edit="canEdit"
                  :screen-label="resolveScreen(sub.screen).label"
                  :screen-subtitle="resolveScreen(sub.screen).subtitle"
                  :no-branches="true"
                  @update:action="(v) => setSubStepField(step.id, branch.id, sub.id, 'action', v)"
                  @update:comment="(v) => setSubStepField(step.id, branch.id, sub.id, 'comment', v)"
                  @change-screen="emit('pick-screen', step.id, branch.id, sub.id)"
                  @remove="removeSubStep(step.id, branch.id, sub.id)"
                  @edit-attempt="emit('edit-attempt')"
                />
              </template>
              <button
                v-if="canEdit"
                type="button"
                class="rail__add rail__add--sm fr-btn fr-btn--tertiary fr-btn--sm fr-icon-add-line fr-btn--icon-left"
                @click="addSubStep(step.id, branch.id)"
              >
                Étape
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <p v-if="!steps.length" class="rail__empty">
      Aucune étape pour l'instant. Cliquez sur « Étape » pour démarrer le parcours.
    </p>
  </div>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.rail__row {
  display: flex;
  align-items: stretch;
  gap: 0.6rem;
  overflow-x: auto;
  padding: 0.5rem 0.25rem 1rem;
  scroll-snap-type: x proximity;
}
.rail__row--sub {
  padding-top: 0.25rem;
  padding-bottom: 0.5rem;
}
.rail__step-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  scroll-snap-align: start;
}
.rail__nav {
  display: flex;
  gap: 0.2rem;
  justify-content: center;
}
.rail__nav .fr-btn {
  font-size: 0.7rem;
  padding: 0.1rem 0.3rem;
}
.rail__arrow {
  display: flex;
  align-items: center;
  color: #aaa;
  font-size: 1.4rem;
  flex-shrink: 0;
}
.rail__add {
  align-self: center;
  flex-shrink: 0;
}
.rail__add--sm {
  font-size: 0.85rem;
}
.rail__empty {
  color: #888;
  font-style: italic;
  padding: 1rem;
  text-align: center;
}
.rail__branches {
  margin-left: 2rem;
  border-left: 2px dashed #d4a373;
  padding-left: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.rail__branch-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  font-size: 0.9rem;
  color: #6e445a;
}
.rail__branch-from {
  color: #888;
  font-size: 0.8rem;
  margin-right: auto;
}
</style>
