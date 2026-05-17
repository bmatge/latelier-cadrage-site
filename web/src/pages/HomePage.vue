<script setup lang="ts">
// Picker — liste des projets à gauche, bloc « Créer un projet » à droite.
// 3 modalités de création (vide / via IA / depuis bundle), chacune
// déléguée à une modal dédiée pour cohérence visuelle.

import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import {
  listProjects,
  deleteProject,
  exportProjectBundle,
  type ProjectListItem,
} from '../api/projects.api.js';
import { getCadrageStatus, type CadrageStatus } from '../api/cadrage.api.js';
import { useAuthStore } from '../stores/auth.js';
import { useConfirm } from '../stores/confirm.js';
import PageHeader from '../components/ui/PageHeader.vue';
import CadrageModal from '../components/cadrage/CadrageModal.vue';
import CreateBlankModal from '../components/create/CreateBlankModal.vue';
import ImportBundleModal from '../components/create/ImportBundleModal.vue';

const confirmStore = useConfirm();
const router = useRouter();

const auth = useAuthStore();
const projects = ref<readonly ProjectListItem[]>([]);
const loading = ref(true);

const cadrageStatus = ref<CadrageStatus>({ enabled: false, configured: false, model: null });

// 3 modales — exclusives (une seule ouverte à la fois). Une variable
// dédiée par modal pour découpler les états (pas de bug si l'utilisateur
// switche entre elles via Esc/click extérieur + reclic).
const blankOpen = ref(false);
const cadrageOpen = ref(false);
const importOpen = ref(false);

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

async function onProjectCreated(slug: string): Promise<void> {
  blankOpen.value = false;
  cadrageOpen.value = false;
  importOpen.value = false;
  await refresh();
  await router.push(`/p/${slug}/arborescence`);
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
  const ok = await confirmStore.ask({
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
            <button type="button" class="create-method" @click="blankOpen = true">
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
              :class="{ 'is-disabled': !cadrageStatus.configured }"
              :disabled="!cadrageStatus.configured"
              :title="!cadrageStatus.configured ? 'Albert non configuré (clé manquante)' : ''"
              @click="cadrageOpen = true"
            >
              <span class="create-method__icon fr-icon-magic-line" aria-hidden="true"></span>
              <span class="create-method__label">Via IA</span>
              <span class="create-method__hint"
                >Albert (DINUM) propose un projet depuis vos documents.</span
              >
            </button>

            <button type="button" class="create-method" @click="importOpen = true">
              <span class="create-method__icon fr-icon-upload-line" aria-hidden="true"></span>
              <span class="create-method__label">Depuis un bundle</span>
              <span class="create-method__hint">JSON exporté d'un autre atelier ou d'une IA.</span>
            </button>
          </div>

          <p
            v-if="cadrageStatus.enabled && !cadrageStatus.configured"
            class="alert"
            style="margin-top: 0.5rem; font-size: 0.85rem"
          >
            ⚠ Albert non configuré côté serveur (clé manquante). Contactez un admin.
          </p>
        </section>
      </div>
    </div>

    <CreateBlankModal :open="blankOpen" @close="blankOpen = false" @created="onProjectCreated" />
    <CadrageModal
      :open="cadrageOpen"
      :status="cadrageStatus"
      @close="cadrageOpen = false"
      @imported="onProjectCreated"
    />
    <ImportBundleModal
      :open="importOpen"
      @close="importOpen = false"
      @imported="onProjectCreated"
    />
  </div>
</template>

<style scoped>
.create-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.5rem;
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
  box-shadow: 0 2px 8px rgba(0, 0, 145, 0.08);
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
</style>
