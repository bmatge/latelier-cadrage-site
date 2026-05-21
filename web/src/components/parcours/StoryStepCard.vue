<script setup lang="ts">
// Une carte d'écran dans le fil de fer d'un parcours.
//
// Structure compacte :
//   - En-tête : pastille kind (clic = picker) + label + boutons outils
//     (ouvrir l'entité dans sa page · branche · supprimer)
//   - Corps : tag thème (popover) + action utilisateur + commentaires
//
// L'écran est passé en entier, le parent résout les refs vers les labels
// lisibles et les fournit via `screenLabel`/`screenSubtitle`.

import { computed, ref } from 'vue';
import type { Screen, LeafStep, VocabEntry } from '@latelier/shared';
import InlineEdit from '../ui/InlineEdit.vue';
import { KIND_STYLES } from './screen-kinds.js';

const props = defineProps<{
  readonly step: LeafStep;
  readonly canEdit: boolean;
  readonly screenLabel: string;
  readonly screenSubtitle?: string | undefined;
  readonly noBranches?: boolean | undefined;
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
  /** Demande au parent d'ouvrir l'entité référencée (node/block/dispositif)
   * dans sa page d'édition dédiée. Pas émis pour kind='ghost'. */
  (e: 'open-entity'): void;
}>();

const screen = computed<Screen>(() => props.step.screen);
const style = computed(() => KIND_STYLES[screen.value.kind]);
const themeKey = computed(() => screen.value.theme_key ?? '');
const themeEntry = computed(() => props.themes.find((t) => t.key === themeKey.value) ?? null);
const canOpenEntity = computed(() => screen.value.kind !== 'ghost' && !!screen.value.ref);

const themeOpen = ref(false);
function toggleTheme(): void {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  themeOpen.value = !themeOpen.value;
}
function pickTheme(k: string | null): void {
  emit('update:theme', k);
  themeOpen.value = false;
}
function onThemeBlur(e: FocusEvent): void {
  // Ferme le popover si focus part en dehors
  const next = e.relatedTarget as HTMLElement | null;
  const wrap = (e.currentTarget as HTMLElement).closest('.step-card__theme');
  if (!next || !wrap?.contains(next)) themeOpen.value = false;
}

/**
 * Palette des thèmes par défaut (vocab.story_themes). Si l'utilisateur a
 * créé un thème custom, on retombe sur le gris neutre.
 */
const THEME_PALETTE: Readonly<Record<string, { bg: string; fg: string }>> = {
  navigation: { bg: '#e3e3fd', fg: '#000091' },
  information: { bg: '#dffdfb', fg: '#0d5870' },
  action: { bg: '#b8fec9', fg: '#18753c' },
  transaction: { bg: '#fee7fc', fg: '#6e445a' },
};

const themePalette = computed(() => {
  return THEME_PALETTE[themeKey.value] ?? { bg: '#eee', fg: '#555' };
});
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
          v-if="canOpenEntity"
          type="button"
          class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-external-link-line"
          title="Ouvrir cet écran dans sa page d'édition"
          @click="emit('open-entity')"
        ></button>
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
          :title="canEdit ? 'Supprimer l\'étape' : 'Activer l\'édition pour supprimer'"
          :disabled="!canEdit"
          @click="canEdit ? emit('remove') : emit('edit-attempt')"
        ></button>
      </div>
    </header>
    <div class="step-card__body">
      <div class="step-card__theme" @focusout="onThemeBlur">
        <button
          v-if="themeEntry"
          type="button"
          class="step-card__theme-tag"
          :style="{ background: themePalette.bg, color: themePalette.fg }"
          :title="canEdit ? 'Changer le thème' : 'Thème'"
          @click="toggleTheme"
        >
          {{ themeEntry.label }}
        </button>
        <button
          v-else
          type="button"
          class="step-card__theme-add fr-icon-add-line"
          :title="canEdit ? 'Ajouter un thème' : 'Activer l\'édition pour définir un thème'"
          :disabled="!canEdit"
          @click="toggleTheme"
        >
          Thème
        </button>
        <div v-if="themeOpen" class="step-card__theme-menu" role="menu">
          <button
            v-if="themeEntry"
            type="button"
            role="menuitem"
            class="step-card__theme-option step-card__theme-option--remove"
            @click="pickTheme(null)"
          >
            <span class="fr-icon-close-line fr-icon--sm" aria-hidden="true"></span>
            Retirer le thème
          </button>
          <button
            v-for="t in themes"
            :key="t.key"
            type="button"
            role="menuitem"
            class="step-card__theme-option"
            :class="{ 'step-card__theme-option--active': t.key === themeKey }"
            @click="pickTheme(t.key)"
          >
            <span
              class="step-card__theme-swatch"
              :style="{
                background: THEME_PALETTE[t.key]?.bg ?? '#eee',
                borderColor: THEME_PALETTE[t.key]?.fg ?? '#aaa',
              }"
              aria-hidden="true"
            ></span>
            {{ t.label }}
          </button>
        </div>
      </div>
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

/* Tag thème + popover de sélection */
.step-card__theme {
  position: relative;
  display: flex;
  align-items: center;
}
.step-card__theme-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid currentColor;
  background: var(--bg, #eee);
}
.step-card__theme-tag:hover {
  filter: brightness(0.95);
}
.step-card__theme-add {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: #888;
  background: transparent;
  border: 1px dashed #ccc;
  border-radius: 999px;
  padding: 0.1rem 0.5rem 0.1rem 0.4rem;
  cursor: pointer;
}
.step-card__theme-add:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.step-card__theme-add:hover:not(:disabled) {
  border-color: #888;
  color: #444;
}
.step-card__theme-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.25rem;
  z-index: 20;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  min-width: 12rem;
  padding: 0.25rem;
}
.step-card__theme-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  font-size: 0.85rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  border-radius: 3px;
}
.step-card__theme-option:hover {
  background: #f3f3ff;
}
.step-card__theme-option--active {
  font-weight: 600;
  background: #f7f7fc;
}
.step-card__theme-option--remove {
  color: #777;
  border-bottom: 1px solid #eee;
  margin-bottom: 0.15rem;
  padding-bottom: 0.4rem;
}
.step-card__theme-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid;
  flex-shrink: 0;
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
