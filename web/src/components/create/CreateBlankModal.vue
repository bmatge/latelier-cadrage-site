<script setup lang="ts">
// Modal de création d'un projet vide — équivalent du formulaire qui était
// inline dans la HomePage, présenté dans la même UI que la modal IA et la
// modal Import pour cohérence visuelle.

import { ref, watch } from 'vue';
import { createProject } from '../../api/projects.api.js';
import BaseModal from '../ui/BaseModal.vue';

const props = defineProps<{
  readonly open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created', slug: string): void;
}>();

const newSlug = ref('');
const newName = ref('');
const newDescription = ref('');
const error = ref<string | null>(null);
const creating = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      newSlug.value = '';
      newName.value = '';
      newDescription.value = '';
      error.value = null;
      creating.value = false;
    }
  },
);

function slugifyName(): void {
  if (!newSlug.value && newName.value) {
    newSlug.value = newName.value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }
}

async function onSubmit(): Promise<void> {
  error.value = null;
  creating.value = true;
  try {
    const payload: { slug: string; name: string; description?: string } = {
      slug: newSlug.value,
      name: newName.value,
    };
    if (newDescription.value) payload.description = newDescription.value;
    const project = await createProject(payload);
    emit('created', project.slug);
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    error.value = e.response?.data?.detail || e.response?.data?.error || 'Erreur de création';
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Créer un projet vide"
    subtitle="Vous démarrez avec une racine et un vocabulaire minimal — l'arborescence est à remplir manuellement."
    size="sm"
    @close="emit('close')"
  >
    <form id="create-blank-form" @submit.prevent="onSubmit">
      <div class="fr-input-group">
        <label class="fr-label" for="cb-name">
          Nom du projet
          <span class="fr-hint-text">Jusqu'à 100 caractères.</span>
        </label>
        <input
          id="cb-name"
          v-model="newName"
          type="text"
          class="fr-input"
          required
          placeholder="Hub mobilités propres…"
          @blur="slugifyName"
        />
      </div>

      <div class="fr-input-group fr-mt-2w">
        <label class="fr-label" for="cb-slug">
          Slug technique
          <span class="fr-hint-text">a-z, 0-9, tirets. Max 50. Auto-généré depuis le nom.</span>
        </label>
        <input
          id="cb-slug"
          v-model="newSlug"
          type="text"
          class="fr-input"
          required
          pattern="[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?"
          placeholder="hub-mobilites-propres"
        />
      </div>

      <div class="fr-input-group fr-mt-2w">
        <label class="fr-label" for="cb-desc">
          Description (optionnel)
          <span class="fr-hint-text">Max 500 caractères.</span>
        </label>
        <textarea
          id="cb-desc"
          v-model="newDescription"
          class="fr-input"
          rows="2"
          maxlength="500"
          placeholder="Une phrase pour situer le projet…"
        />
      </div>

      <div v-if="error" class="fr-alert fr-alert--error fr-mt-2w">
        <p>{{ error }}</p>
      </div>
    </form>

    <template #footer>
      <button type="button" class="fr-btn fr-btn--secondary" @click="emit('close')">Annuler</button>
      <button
        type="submit"
        form="create-blank-form"
        class="fr-btn fr-icon-add-line fr-btn--icon-left"
        :disabled="creating"
      >
        {{ creating ? 'Création…' : 'Créer le projet' }}
      </button>
    </template>
  </BaseModal>
</template>
