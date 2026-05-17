<script setup lang="ts">
// Modal d'import d'un projet depuis un fichier JSON (bundle). File picker
// classique + drag-drop sur la zone d'upload, affichage du fichier
// sélectionné, validation JSON locale puis appel /projects/import.

import { ref, watch } from 'vue';
import { importProjectBundle } from '../../api/projects.api.js';
import BaseModal from '../ui/BaseModal.vue';

const props = defineProps<{
  readonly open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'imported', slug: string): void;
}>();

const file = ref<File | null>(null);
const error = ref<string | null>(null);
const importing = ref(false);
const dragOver = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      file.value = null;
      error.value = null;
      importing.value = false;
      dragOver.value = false;
    }
  },
);

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
  error.value = null;
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  dragOver.value = false;
  const f = event.dataTransfer?.files?.[0];
  if (f) {
    file.value = f;
    error.value = null;
  }
}

async function onImport(): Promise<void> {
  if (!file.value) return;
  error.value = null;
  importing.value = true;
  try {
    const text = await file.value.text();
    let bundle: unknown;
    try {
      bundle = JSON.parse(text);
    } catch {
      throw new Error('Le fichier ne contient pas de JSON valide.');
    }
    const project = await importProjectBundle(bundle);
    emit('imported', project.slug);
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    error.value = e.response?.data?.detail ?? e.response?.data?.error ?? (err as Error).message;
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Importer un projet depuis un bundle JSON"
    subtitle="Bundle exporté d'un autre atelier, généré par une IA, ou produit à la main d'après docs/bundle-format.md."
    size="sm"
    @close="emit('close')"
  >
    <p class="fr-text--lead">
      Sélectionnez un fichier <code>.json</code> au format bundle (arbre, roadmap, vocabulaires,
      catalogues). Si le slug est déjà pris, il sera suffixé <code>-2</code>, <code>-3</code>…
    </p>

    <div
      class="import-dropzone"
      :class="{ 'is-over': dragOver, 'is-filled': file != null }"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop="onDrop"
    >
      <span class="fr-icon-upload-line import-dropzone__icon" aria-hidden="true"></span>
      <p v-if="!file">
        <strong>Glissez votre fichier ici</strong>
        ou
        <label class="import-dropzone__link">
          parcourez votre disque
          <input
            type="file"
            accept="application/json,.json"
            style="display: none"
            :disabled="importing"
            @change="onFile"
          />
        </label>
      </p>
      <p v-else class="import-dropzone__file">
        <strong>{{ file.name }}</strong>
        <span class="import-dropzone__size"> {{ Math.round(file.size / 1024) }} KiB </span>
        <button
          type="button"
          class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-close-line fr-btn--icon-left"
          :disabled="importing"
          @click="file = null"
        >
          Changer
        </button>
      </p>
    </div>

    <div v-if="error" class="fr-alert fr-alert--error fr-mt-2w">
      <p>{{ error }}</p>
    </div>

    <p class="fr-text--sm" style="color: #666; margin-top: 1rem">
      Les divergences de format connues (audiences singulier, options en objets, etc.) sont
      normalisées automatiquement au passage de l'import.
    </p>

    <template #footer>
      <button type="button" class="fr-btn fr-btn--secondary" @click="emit('close')">Annuler</button>
      <button
        type="button"
        class="fr-btn fr-icon-check-line fr-btn--icon-left"
        :disabled="!file || importing"
        @click="onImport"
      >
        {{ importing ? 'Import en cours…' : 'Importer le projet' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.import-dropzone {
  margin-top: 1rem;
  padding: 1.5rem;
  border: 2px dashed #ccc;
  background: #fafafa;
  text-align: center;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.import-dropzone.is-over {
  border-color: var(--text-action-high-blue-france, #000091);
  background: var(--background-alt-blue-france, #eef0ff);
}

.import-dropzone.is-filled {
  border-style: solid;
  border-color: var(--text-action-high-blue-france, #000091);
  background: var(--background-contrast-info, #eef0ff);
}

.import-dropzone__icon {
  font-size: 2rem;
  display: block;
  margin: 0 auto 0.5rem;
  color: var(--text-action-high-blue-france, #000091);
}

.import-dropzone__link {
  text-decoration: underline;
  cursor: pointer;
  color: var(--text-action-high-blue-france, #000091);
}

.import-dropzone__file {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.import-dropzone__size {
  color: #666;
  font-size: 0.9rem;
}
</style>
