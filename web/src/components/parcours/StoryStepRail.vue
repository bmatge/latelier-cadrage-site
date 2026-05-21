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

// ----- Drag & drop -----
//
// Format de payload : `application/x-parcours-step` = JSON
//   { stepId: string, branchId: string | null }
//
// branchId === null → step du rail principal. Sinon → leaf-step dans la
// branche identifiée. En v1, on n'autorise le drop QUE dans le même
// scope (rail↔rail ou même branche↔même branche). Les déplacements
// inter-scope (rail↔branche, branche↔branche, parcours↔parcours) sont
// volontairement bloqués pour ne pas avoir à arbitrer ce qui se passe
// avec les branches existantes du step déplacé. Le payload est conçu
// pour qu'on puisse les autoriser plus tard sans changer la convention.

const DRAG_MIME = 'application/x-parcours-step';

interface DragPayload {
  stepId: string;
  branchId: string | null;
}

function startDrag(e: DragEvent, payload: DragPayload): void {
  if (!props.canEdit || !e.dataTransfer) {
    e.preventDefault();
    return;
  }
  // Inputs/textarea/boutons → on laisse le browser sélectionner du texte
  // ou cliquer, on ne déclenche pas le drag du wrapper.
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, button, [contenteditable]')) {
    e.preventDefault();
    return;
  }
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.setData('text/plain', payload.stepId); // fallback
}

function isParcoursDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(DRAG_MIME);
}

function onDragOver(e: DragEvent): void {
  if (!props.canEdit || !isParcoursDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const offset = e.clientX - rect.left;
  el.classList.remove('drag-over-before', 'drag-over-after');
  el.classList.add(offset < rect.width * 0.5 ? 'drag-over-before' : 'drag-over-after');
}

function onDragLeave(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove('drag-over-before', 'drag-over-after');
}

function onDrop(e: DragEvent, targetId: string, targetBranchId: string | null): void {
  if (!props.canEdit) return;
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  const mode: 'before' | 'after' = el.classList.contains('drag-over-before') ? 'before' : 'after';
  el.classList.remove('drag-over-before', 'drag-over-after');

  const raw = e.dataTransfer?.getData(DRAG_MIME);
  if (!raw) return;
  let src: DragPayload;
  try {
    src = JSON.parse(raw) as DragPayload;
  } catch {
    return;
  }
  if (src.stepId === targetId) return;
  // En v1, on bloque le cross-scope (cf. note ci-dessus).
  if (src.branchId !== targetBranchId) return;

  if (targetBranchId === null) {
    reorderMainRail(src.stepId, targetId, mode);
  } else {
    reorderBranch(targetBranchId, src.stepId, targetId, mode);
  }
}

function reorderMainRail(sourceId: string, targetId: string, mode: 'before' | 'after'): void {
  const next = cloneSteps();
  const sIdx = next.findIndex((s) => s.id === sourceId);
  if (sIdx < 0) return;
  const [moved] = next.splice(sIdx, 1);
  if (!moved) return;
  const tIdx = next.findIndex((s) => s.id === targetId);
  if (tIdx < 0) {
    next.push(moved);
  } else {
    next.splice(mode === 'before' ? tIdx : tIdx + 1, 0, moved);
  }
  emitChange(next);
}

function reorderBranch(
  branchId: string,
  sourceId: string,
  targetId: string,
  mode: 'before' | 'after',
): void {
  const next = cloneSteps();
  for (const step of next) {
    const branch = step.branches?.find((b) => b.id === branchId);
    if (!branch) continue;
    const sIdx = branch.steps.findIndex((s) => s.id === sourceId);
    if (sIdx < 0) return;
    const list = [...branch.steps];
    const [moved] = list.splice(sIdx, 1);
    if (!moved) return;
    const tIdx = list.findIndex((s) => s.id === targetId);
    if (tIdx < 0) list.push(moved);
    else list.splice(mode === 'before' ? tIdx : tIdx + 1, 0, moved);
    branch.steps = list;
    break;
  }
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
        <div class="rail__column">
          <div
            class="rail__step-wrap"
            :draggable="canEdit"
            @dragstart="startDrag($event, { stepId: step.id, branchId: null })"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop($event, step.id, null)"
          >
            <div class="rail__nav">
              <span
                class="rail__drag-handle fr-icon-drag-move-2-line fr-icon--sm"
                aria-hidden="true"
                title="Glisser pour réordonner"
              ></span>
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

          <!-- Branches de CE step : verticalement alignées sous lui -->
          <div v-if="(step.branches ?? []).length" class="rail__branches">
            <div v-for="branch in step.branches" :key="branch.id" class="rail__branch">
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
                <button
                  type="button"
                  class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-delete-line"
                  :disabled="!canEdit"
                  title="Supprimer la branche"
                  @click="removeBranch(step.id, branch.id)"
                ></button>
              </header>
              <div class="rail__row rail__row--sub">
                <template v-for="(sub, j) in branch.steps" :key="sub.id">
                  <span v-if="j > 0" class="rail__arrow" aria-hidden="true">→</span>
                  <div
                    class="rail__step-wrap rail__step-wrap--sub"
                    :draggable="canEdit"
                    @dragstart="startDrag($event, { stepId: sub.id, branchId: branch.id })"
                    @dragover="onDragOver"
                    @dragleave="onDragLeave"
                    @drop="onDrop($event, sub.id, branch.id)"
                  >
                    <StoryStepCard
                      :step="sub"
                      :can-edit="canEdit"
                      :screen-label="resolveScreen(sub.screen).label"
                      :screen-subtitle="resolveScreen(sub.screen).subtitle"
                      :no-branches="true"
                      @update:action="
                        (v) => setSubStepField(step.id, branch.id, sub.id, 'action', v)
                      "
                      @update:comment="
                        (v) => setSubStepField(step.id, branch.id, sub.id, 'comment', v)
                      "
                      @change-screen="emit('pick-screen', step.id, branch.id, sub.id)"
                      @remove="removeSubStep(step.id, branch.id, sub.id)"
                      @edit-attempt="emit('edit-attempt')"
                    />
                  </div>
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
/* Rail principal : flex row align-start pour que les arrows soient
   alignées avec le haut des cartes (pas avec la branche). Chaque step
   est dans une `.rail__column` qui contient la carte + les branches
   verticalement en dessous. */
.rail__row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  overflow-x: auto;
  padding: 0.5rem 0.25rem 1rem;
  scroll-snap-type: x proximity;
}
.rail__row--sub {
  padding-top: 0.25rem;
  padding-bottom: 0.5rem;
  align-items: flex-start;
}
.rail__column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex-shrink: 0;
  scroll-snap-align: start;
}
.rail__step-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  position: relative;
}
.rail__step-wrap[draggable='true'] {
  cursor: grab;
}
.rail__step-wrap[draggable='true']:active {
  cursor: grabbing;
}
/* Indicateur de drop : trait bleu vertical à gauche ou à droite de la
   carte cible. Pseudo-élément pour ne pas perturber le layout. */
.rail__step-wrap.drag-over-before::before,
.rail__step-wrap.drag-over-after::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--text-action-high-blue-france, #000091);
  border-radius: 2px;
  z-index: 5;
  pointer-events: none;
}
.rail__step-wrap.drag-over-before::before {
  left: -8px;
}
.rail__step-wrap.drag-over-after::after {
  right: -8px;
}
.rail__step-wrap--sub {
  position: relative;
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
.rail__drag-handle {
  display: inline-flex;
  align-items: center;
  color: #999;
  cursor: grab;
  padding: 0.1rem 0.3rem;
}
.rail__step-wrap[draggable='true']:active .rail__drag-handle {
  cursor: grabbing;
  color: var(--text-action-high-blue-france, #000091);
}
.rail__arrow {
  display: flex;
  align-items: flex-start;
  color: #aaa;
  font-size: 1.4rem;
  flex-shrink: 0;
  /* Aligne la flèche avec le centre de la carte (la carte commence
     après le `.rail__nav` ~28px de haut). */
  padding-top: 4rem;
}
.rail__add {
  align-self: center;
  flex-shrink: 0;
  margin-top: 4rem;
}
.rail__add--sm {
  font-size: 0.85rem;
  margin-top: 0;
}
.rail__empty {
  color: #888;
  font-style: italic;
  padding: 1rem;
  text-align: center;
}
/* Stack vertical des branches sous le step parent. Bordure pointillée
   à gauche qui matérialise visuellement la descendance. */
.rail__branches {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-left: 2px dashed #d4a373;
  margin-left: 1rem;
  padding-left: 0.75rem;
}
.rail__branch-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #6e445a;
}
.rail__branch-head .fr-btn {
  margin-left: auto;
}
</style>
