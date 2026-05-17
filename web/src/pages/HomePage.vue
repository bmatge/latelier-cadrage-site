<script setup lang="ts">
// Picker — liste des projets, création de nouveau projet, import bundle JSON.
// Organisation 2 colonnes :
//   - gauche : "Projets existants" (cartes enrichies)
//   - droite : "Nouveau projet" (form) + "Importer un projet" (file input)

import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import {
  listProjects,
  createProject,
  deleteProject,
  exportProjectBundle,
  importProjectBundle,
  type ProjectListItem,
} from '../api/projects.api.js';
import { getCadrageStatus, type CadrageStatus } from '../api/cadrage.api.js';
import { useAuthStore } from '../stores/auth.js';
import { useConfirm } from '../stores/confirm.js';
import PageHeader from '../components/ui/PageHeader.vue';
import CadrageModal from '../components/cadrage/CadrageModal.vue';

const confirm = useConfirm();
const router = useRouter();

const auth = useAuthStore();
const projects = ref<readonly ProjectListItem[]>([]);
const loading = ref(true);

const newSlug = ref('');
const newName = ref('');
const newDescription = ref('');
const createError = ref<string | null>(null);
const creating = ref(false);

const importError = ref<string | null>(null);
const importing = ref(false);

const cadrageStatus = ref<CadrageStatus>({ enabled: false, configured: false, model: null });
const cadrageModalOpen = ref(false);

// 3 modalités de création regroupées dans un bloc unifié. Une seule est
// « dépliée » à la fois : on garde 'blank' par défaut (cas le plus
// fréquent). Cliquer sur la card 'ai' ouvre la modal, cliquer sur 'import'
// déclenche le file picker — aucune des deux ne déploie de contenu inline.
type CreateMethod = 'blank' | 'ai' | 'import';
const activeMethod = ref<CreateMethod>('blank');
const importInput = ref<HTMLInputElement | null>(null);

function pickMethod(method: CreateMethod): void {
  if (method === 'blank') {
    activeMethod.value = 'blank';
  } else if (method === 'ai') {
    activeMethod.value = 'ai';
    cadrageModalOpen.value = true;
  } else {
    activeMethod.value = 'import';
    importInput.value?.click();
  }
}

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    projects.value = await listProjects();
  } finally {
    loading.value = false;
  }
}

async function refreshCadrageStatus(): Promise<void> {
  cadrageStatus.value = await getCadrageStatus();
}

onMounted(() => {
  void refresh();
  void refreshCadrageStatus();
});

async function onCadrageImported(slug: string): Promise<void> {
  cadrageModalOpen.value = false;
  await refresh();
  await router.push(`/p/${slug}/arborescence`);
}

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

async function handleCreate(): Promise<void> {
  createError.value = null;
  creating.value = true;
  try {
    const payload: { slug: string; name: string; description?: string } = {
      slug: newSlug.value,
      name: newName.value,
    };
    if (newDescription.value) payload.description = newDescription.value;
    await createProject(payload);
    newSlug.value = '';
    newName.value = '';
    newDescription.value = '';
    await refresh();
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    createError.value = e.response?.data?.detail || e.response?.data?.error || 'Erreur de création';
  } finally {
    creating.value = false;
  }
}

async function handleExport(slug: string): Promise<void> {
  try {
    const bundle = await exportProjectBundle(slug);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bundle-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert(`Export impossible : ${(err as Error).message}`);
  }
}

async function handleDelete(p: ProjectListItem): Promise<void> {
  const ok = await confirm.ask({
    title: `Supprimer le projet « ${p.name} » ?`,
    message:
      'Toutes ses données seront perdues définitivement : arborescence, roadmap, maquette, catalogues, historique des révisions.',
    confirmLabel: 'Supprimer le projet',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteProject(p.slug);
    await refresh();
  } catch (err) {
    alert(`Suppression impossible : ${(err as Error).message}`);
  }
}

async function handleImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importError.value = null;
  importing.value = true;
  try {
    const text = await file.text();
    const bundle = JSON.parse(text) as unknown;
    await importProjectBundle(bundle);
    await refresh();
    input.value = '';
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    importError.value =
      e.response?.data?.detail || e.response?.data?.error || (err as Error).message;
  } finally {
    importing.value = false;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const canCreate = () => auth.can('project:create');
</script>

<template>
  <div>
    <PageHeader
      title="Vos projets"
      subtitle="Sélectionnez un projet pour l'éditer, créez-en un nouveau, ou importez un projet exporté."
    />

    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-lg-7">
        <section class="panel-card">
          <h2 class="panel-card__title">Projets existants</h2>
          <p v-if="loading">Chargement…</p>
          <p v-else-if="projects.length === 0" style="color: #666">
            Aucun projet pour l'instant. Créez-en un à droite, ou importez un bundle JSON.
          </p>
          <article v-for="p in projects" :key="p.id" class="project-card">
            <div class="project-card__head">
              <RouterLink :to="`/p/${p.slug}/arborescence`" class="project-card__title">
                {{ p.name }}
              </RouterLink>
              <code class="project-card__slug">{{ p.slug }}</code>
              <span class="badge" :class="p.is_public ? 'badge-public' : 'badge-private'">
                {{ p.is_public ? '🌐 Public' : '🔒 Privé' }}
              </span>
            </div>
            <p v-if="p.description" class="project-card__desc">{{ p.description }}</p>
            <p class="project-card__meta">
              {{ p.revision_count }} révision{{ p.revision_count > 1 ? 's' : '' }} · créé le
              {{ fmtDate(p.created_at) }}
            </p>
            <div class="project-card__actions">
              <RouterLink
                :to="`/p/${p.slug}/arborescence`"
                class="fr-btn fr-btn--sm fr-icon-edit-line fr-btn--icon-left"
              >
                Ouvrir
              </RouterLink>
              <button
                class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-download-line fr-btn--icon-left"
                @click="handleExport(p.slug)"
              >
                Exporter
              </button>
              <button
                v-if="auth.can('project:delete:own', p.id)"
                class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-delete-line fr-btn--icon-left"
                style="color: #ce0500"
                @click="handleDelete(p)"
              >
                Supprimer
              </button>
            </div>
          </article>
        </section>
      </div>

      <div class="fr-col-12 fr-col-lg-5">
        <section v-if="!canCreate()" class="panel-card alert">
          Vous êtes <strong>viewer</strong> : vous pouvez consulter les projets publics mais pas en
          créer. Demandez à un admin l'attribution d'un rôle <code>editor</code>.
        </section>

        <section v-else class="panel-card">
          <h2 class="panel-card__title">Créer un projet</h2>
          <p style="color: #666; font-size: 0.9rem; margin: 0 0 1rem">
            Choisissez la méthode qui vous convient.
            <RouterLink to="/aide" class="fr-link fr-link--sm">Voir le guide</RouterLink>
          </p>

          <div class="create-methods">
            <button
              type="button"
              class="create-method"
              :class="{ 'is-active': activeMethod === 'blank' }"
              @click="pickMethod('blank')"
            >
              <span class="create-method__icon fr-icon-add-circle-line" aria-hidden="true"></span>
              <span class="create-method__label">Vide</span>
              <span class="create-method__hint"
                >Formulaire — vous démarrez avec une racine seule.</span
              >
            </button>

            <button
              v-if="cadrageStatus.enabled"
              type="button"
              class="create-method"
              :class="{
                'is-active': activeMethod === 'ai',
                'is-disabled': !cadrageStatus.configured,
              }"
              :disabled="!cadrageStatus.configured"
              :title="!cadrageStatus.configured ? 'Albert non configuré (clé manquante)' : ''"
              @click="pickMethod('ai')"
            >
              <span class="create-method__icon fr-icon-magic-line" aria-hidden="true"></span>
              <span class="create-method__label">Via IA</span>
              <span class="create-method__hint"
                >Albert (DINUM) propose un projet depuis vos documents.</span
              >
            </button>

            <button
              type="button"
              class="create-method"
              :class="{ 'is-active': activeMethod === 'import' }"
              :disabled="importing"
              @click="pickMethod('import')"
            >
              <span class="create-method__icon fr-icon-upload-line" aria-hidden="true"></span>
              <span class="create-method__label">Depuis un bundle</span>
              <span class="create-method__hint">JSON exporté d'un autre atelier ou d'une IA.</span>
            </button>
          </div>

          <!-- Formulaire 'vide' — seul cas où une saisie inline est nécessaire -->
          <form
            v-if="activeMethod === 'blank'"
            class="create-blank-form"
            @submit.prevent="handleCreate"
          >
            <label class="field">
              <span>Nom</span>
              <input
                v-model="newName"
                type="text"
                class="fr-input"
                required
                placeholder="Hub mobilités propres…"
                @blur="slugifyName"
              />
            </label>
            <label class="field">
              <span>Slug <small style="color: #888">(a-z, 0-9, tirets)</small></span>
              <input
                v-model="newSlug"
                type="text"
                class="fr-input"
                required
                pattern="[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?"
                placeholder="hub-mobilites-propres"
              />
            </label>
            <label class="field">
              <span>Description (optionnel)</span>
              <textarea
                v-model="newDescription"
                class="fr-input"
                rows="2"
                placeholder="Une phrase pour situer le projet…"
              />
            </label>
            <p v-if="createError" class="alert alert-error">{{ createError }}</p>
            <p>
              <button
                type="submit"
                class="fr-btn fr-icon-add-line fr-btn--icon-left"
                :disabled="creating"
              >
                {{ creating ? 'Création…' : 'Créer le projet' }}
              </button>
            </p>
          </form>

          <!-- Statuts inline pour 'import' (le file picker est invisible mais l'erreur doit être lisible) -->
          <p v-if="activeMethod === 'import' && importing" class="create-status">
            Import en cours…
          </p>
          <p
            v-if="activeMethod === 'import' && importError"
            class="alert alert-error create-status"
          >
            {{ importError }}
          </p>
          <p
            v-if="activeMethod === 'ai' && cadrageStatus.enabled && !cadrageStatus.configured"
            class="alert create-status"
          >
            ⚠ Albert non configuré côté serveur (clé manquante). Contactez un admin.
          </p>

          <!-- File input caché, déclenché par le bouton 'Depuis un bundle' -->
          <input
            ref="importInput"
            type="file"
            accept="application/json"
            style="display: none"
            :disabled="importing"
            @change="handleImport"
          />
        </section>
      </div>
    </div>

    <CadrageModal
      :open="cadrageModalOpen"
      :status="cadrageStatus"
      @close="cadrageModalOpen = false"
      @imported="onCadrageImported"
    />
  </div>
</template>

<style scoped>
.create-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.create-method {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.9rem 0.8rem;
  background: white;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.create-method:hover:not(:disabled) {
  border-color: var(--border-action-high-blue-france, #6a6af4);
  background: var(--background-alt-blue-france, #f7f7ff);
}

.create-method.is-active {
  border-color: var(--text-action-high-blue-france, #000091);
  background: var(--background-contrast-info, #eef0ff);
  box-shadow: 0 0 0 2px var(--text-action-high-blue-france, #000091) inset;
}

.create-method.is-disabled,
.create-method:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.create-method__icon {
  font-size: 1.4rem;
  color: var(--text-action-high-blue-france, #000091);
}

.create-method__label {
  font-weight: 600;
  font-size: 1rem;
}

.create-method__hint {
  font-size: 0.78rem;
  color: var(--text-mention-grey, #666);
  line-height: 1.35;
}

.create-blank-form {
  border-top: 1px solid var(--border-default-grey, #eee);
  padding-top: 1rem;
}

.create-status {
  margin-top: 0.5rem;
  font-size: 0.9rem;
}
</style>
