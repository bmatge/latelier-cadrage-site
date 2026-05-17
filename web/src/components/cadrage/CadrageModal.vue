<script setup lang="ts">
// Modal full-screen DSFR : upload d'un document source + appel POC Albert,
// affichage du bundle proposé, import en 1 clic ou consultation du brut.
// État local en machine simple : idle → generating → result | error.

import { computed, ref, watch } from 'vue';
import {
  generateBundleFromDocuments,
  refineBundle,
  type GenerateResult,
  type CadrageStatus,
} from '../../api/cadrage.api.js';
import { importProjectBundle } from '../../api/projects.api.js';

const props = defineProps<{
  readonly open: boolean;
  readonly status: CadrageStatus;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'imported', slug: string): void;
}>();

type Phase = 'idle' | 'generating' | 'result' | 'error' | 'refining';

const phase = ref<Phase>('idle');
const files = ref<File[]>([]);
const instructions = ref('');
const refineText = ref('');
const error = ref<string | null>(null);
const result = ref<GenerateResult | null>(null);
const importing = ref(false);
const importError = ref<string | null>(null);

const maxFiles = computed(() => props.status.maxFiles ?? 5);
const maxFileMiB = computed(() => props.status.maxFileMiB ?? 10);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      phase.value = 'idle';
      files.value = [];
      instructions.value = '';
      refineText.value = '';
      error.value = null;
      result.value = null;
      importing.value = false;
      importError.value = null;
    }
  },
);

function onFiles(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;
  const picked = Array.from(input.files).slice(0, maxFiles.value);
  files.value = picked;
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, i) => i !== index);
}

async function onGenerate(): Promise<void> {
  if (files.value.length === 0) {
    error.value = 'Sélectionnez au moins un fichier source.';
    return;
  }
  phase.value = 'generating';
  error.value = null;
  result.value = null;
  try {
    result.value = await generateBundleFromDocuments(files.value, instructions.value || undefined);
    phase.value = 'result';
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    error.value =
      e.response?.data?.detail ?? e.response?.data?.error ?? (err as Error).message ?? 'Erreur';
    phase.value = 'error';
  }
}

async function onRefine(): Promise<void> {
  if (!result.value || result.value.bundle == null) return;
  if (!refineText.value.trim()) return;
  phase.value = 'refining';
  importError.value = null;
  try {
    const next = await refineBundle(result.value.bundle, refineText.value);
    result.value = next;
    refineText.value = '';
    phase.value = 'result';
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    importError.value =
      e.response?.data?.detail ?? e.response?.data?.error ?? (err as Error).message ?? 'Erreur';
    phase.value = 'result';
  }
}

async function onImport(): Promise<void> {
  if (!result.value || result.value.bundle == null) return;
  importing.value = true;
  importError.value = null;
  try {
    const project = await importProjectBundle(result.value.bundle);
    emit('imported', project.slug);
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    importError.value =
      e.response?.data?.detail ?? e.response?.data?.error ?? (err as Error).message ?? 'Erreur';
  } finally {
    importing.value = false;
  }
}

function reset(): void {
  phase.value = 'idle';
  result.value = null;
  error.value = null;
  importError.value = null;
}

const previewProject = computed(() => {
  const b = result.value?.bundle as
    | { project?: { slug?: unknown; name?: unknown; description?: unknown } }
    | null
    | undefined;
  if (!b?.project) return null;
  return {
    slug: typeof b.project.slug === 'string' ? b.project.slug : '(slug manquant)',
    name: typeof b.project.name === 'string' ? b.project.name : '(nom manquant)',
    description: typeof b.project.description === 'string' ? b.project.description : '',
  };
});

const previewCounts = computed(() => {
  const b = result.value?.bundle as
    | {
        tree?: { children?: readonly unknown[] };
        roadmap?: { items?: readonly unknown[] };
        data?: {
          dispositifs?: { dispositifs?: readonly unknown[] };
          mesures?: { mesures?: readonly unknown[] };
          objectifs?: { axes?: readonly unknown[] };
        };
      }
    | null
    | undefined;
  if (!b) return null;
  return {
    treeChildren: b.tree?.children?.length ?? 0,
    roadmapItems: b.roadmap?.items?.length ?? 0,
    dispositifs: b.data?.dispositifs?.dispositifs?.length ?? 0,
    mesures: b.data?.mesures?.mesures?.length ?? 0,
    axesObjectifs: b.data?.objectifs?.axes?.length ?? 0,
  };
});
</script>

<template>
  <div
    v-if="open"
    class="cadrage-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cadrage-modal-title"
  >
    <div class="cadrage-modal">
      <header class="cadrage-modal__head">
        <h2 id="cadrage-modal-title" class="cadrage-modal__title">Créer un projet avec Albert</h2>
        <p v-if="status.model" class="cadrage-modal__subtitle">
          Modèle : <code>{{ status.model }}</code> · API souveraine DINUM / Etalab
        </p>
        <button
          type="button"
          class="fr-btn--close fr-btn"
          aria-label="Fermer"
          @click="emit('close')"
        >
          Fermer
        </button>
      </header>

      <div class="cadrage-modal__body">
        <!-- Avertissement si flag actif mais clé absente -->
        <div v-if="!status.configured" class="fr-alert fr-alert--warning fr-mb-3w">
          <h3 class="fr-alert__title">Albert non configuré</h3>
          <p>
            Le serveur expose le POC mais ne trouve pas de clé API (<code>ALBERT_API_KEY</code>).
            Contactez un admin.
          </p>
        </div>

        <!-- PHASE 1 : formulaire -->
        <section v-if="phase === 'idle' || phase === 'error'">
          <p class="fr-text--lead">
            Glissez un ou plusieurs documents décrivant votre projet (PDF, DOCX, CSV, TXT, MD) ;
            Albert propose une première arborescence + roadmap + catalogues que vous pourrez
            importer tels quels ou affiner après coup.
          </p>

          <div class="fr-input-group">
            <label class="fr-label" for="cadrage-file">
              Documents source
              <span class="fr-hint-text">
                Jusqu'à {{ maxFiles }} fichiers, {{ maxFileMiB }} MiB chacun. PDF, DOCX, CSV, TSV,
                TXT ou Markdown.
              </span>
            </label>
            <input
              id="cadrage-file"
              type="file"
              class="fr-upload"
              multiple
              accept=".pdf,.docx,.csv,.tsv,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,text/plain,text/markdown"
              :disabled="!status.configured"
              @change="onFiles"
            />
            <ul v-if="files.length > 0" class="cadrage-files">
              <li v-for="(f, i) in files" :key="f.name + i">
                <span class="cadrage-files__name">{{ f.name }}</span>
                <span class="cadrage-files__size"> {{ Math.round(f.size / 1024) }} KiB </span>
                <button
                  type="button"
                  class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-close-line"
                  aria-label="Retirer ce fichier"
                  @click="removeFile(i)"
                >
                  Retirer
                </button>
              </li>
            </ul>
          </div>

          <div class="fr-input-group fr-mt-2w">
            <label class="fr-label" for="cadrage-instructions">
              Consignes complémentaires (optionnel)
              <span class="fr-hint-text">
                Public cible, contraintes éditoriales, scope à privilégier ou à exclure…
              </span>
            </label>
            <textarea
              id="cadrage-instructions"
              v-model="instructions"
              class="fr-input"
              rows="3"
              maxlength="2000"
              :disabled="!status.configured"
              placeholder="Ex. Cible : agents des collectivités. Public principal : maires. Site limité aux dispositifs ANAH/ADEME."
            />
          </div>

          <div v-if="error" class="fr-alert fr-alert--error fr-mt-2w">
            <p>{{ error }}</p>
          </div>

          <div class="cadrage-modal__actions">
            <button type="button" class="fr-btn fr-btn--secondary" @click="emit('close')">
              Annuler
            </button>
            <button
              type="button"
              class="fr-btn fr-icon-magic-line fr-btn--icon-left"
              :disabled="files.length === 0 || !status.configured"
              @click="onGenerate"
            >
              Générer la proposition
            </button>
          </div>
        </section>

        <!-- PHASE 2 : génération en cours -->
        <section
          v-else-if="phase === 'generating' || phase === 'refining'"
          class="cadrage-modal__loading"
        >
          <div class="cadrage-spinner" aria-hidden="true"></div>
          <h3 v-if="phase === 'generating'">Albert analyse vos documents…</h3>
          <h3 v-else>Albert applique votre demande d'affinage…</h3>
          <p>Selon la longueur, cela peut prendre 10 à 60 secondes.</p>
        </section>

        <!-- PHASE 3 : résultat -->
        <section v-else-if="phase === 'result' && result">
          <div v-if="result.bundle == null" class="fr-alert fr-alert--error">
            <h3 class="fr-alert__title">Réponse non parsable</h3>
            <p>
              Albert n'a pas renvoyé de JSON exploitable. Voir la sortie brute ci-dessous, ou
              réessayez avec un document plus structuré / des consignes plus précises.
            </p>
          </div>

          <div v-else-if="!result.valid" class="fr-alert fr-alert--warning">
            <h3 class="fr-alert__title">Bundle généré, non conforme au schéma</h3>
            <p>
              {{ result.errors.length }} erreur{{ result.errors.length > 1 ? 's' : '' }} de
              validation. Vous pouvez importer quand même (l'app est tolérante sur la plupart des
              champs) ou réessayer.
            </p>
          </div>

          <div v-else class="fr-alert fr-alert--success">
            <h3 class="fr-alert__title">Bundle valide ✓</h3>
            <p>Prêt à être importé comme nouveau projet.</p>
          </div>

          <!-- Aperçu projet -->
          <div v-if="previewProject" class="cadrage-preview">
            <h3>
              {{ previewProject.name }} <code>{{ previewProject.slug }}</code>
            </h3>
            <p v-if="previewProject.description" class="cadrage-preview__desc">
              {{ previewProject.description }}
            </p>
            <ul v-if="previewCounts" class="cadrage-preview__counts">
              <li>{{ previewCounts.treeChildren }} rubriques de premier niveau</li>
              <li>{{ previewCounts.roadmapItems }} items de roadmap</li>
              <li>{{ previewCounts.dispositifs }} dispositifs</li>
              <li>{{ previewCounts.mesures }} mesures de politique publique</li>
              <li>{{ previewCounts.axesObjectifs }} axes stratégiques</li>
            </ul>
          </div>

          <!-- Erreurs ajv détaillées -->
          <details v-if="result.errors.length > 0" class="cadrage-errors">
            <summary>Voir les {{ result.errors.length }} erreurs de validation</summary>
            <ul>
              <li v-for="(err, i) in result.errors" :key="i">
                <code>{{ err.path }}</code> — {{ err.message }}
              </li>
            </ul>
          </details>

          <!-- Toggle JSON brut -->
          <details class="cadrage-raw">
            <summary>Sortie brute Albert ({{ Math.round(result.latencyMs / 100) / 10 }} s)</summary>
            <pre>{{ result.raw }}</pre>
          </details>

          <!-- Bloc affinage : permettre de demander des modifications avant l'import -->
          <div v-if="result.bundle != null" class="cadrage-refine">
            <label class="fr-label" for="cadrage-refine">
              Affiner la proposition (optionnel)
              <span class="fr-hint-text">
                Décrivez en français ce que vous voulez changer ; Albert renverra un nouveau bundle
                en gardant le reste intact.
              </span>
            </label>
            <textarea
              id="cadrage-refine"
              v-model="refineText"
              class="fr-input"
              rows="2"
              maxlength="2000"
              placeholder="Ex. Renomme l'axe 1 en « Logement durable », ajoute un dispositif « Ma Prime Logement »."
            />
            <div style="margin-top: 0.5rem; text-align: right">
              <button
                type="button"
                class="fr-btn fr-btn--secondary fr-btn--sm fr-icon-refresh-line fr-btn--icon-left"
                :disabled="!refineText.trim()"
                @click="onRefine"
              >
                Affiner avec Albert
              </button>
            </div>
          </div>

          <div v-if="importError" class="fr-alert fr-alert--error fr-mt-2w">
            <p>{{ importError }}</p>
          </div>

          <div class="cadrage-modal__actions">
            <button type="button" class="fr-btn fr-btn--tertiary" @click="reset">
              Recommencer
            </button>
            <button type="button" class="fr-btn fr-btn--secondary" @click="emit('close')">
              Annuler
            </button>
            <button
              type="button"
              class="fr-btn fr-icon-check-line fr-btn--icon-left"
              :disabled="result.bundle == null || importing"
              @click="onImport"
            >
              {{ importing ? 'Import…' : 'Importer ce projet' }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cadrage-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(22, 22, 22, 0.65);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.cadrage-modal {
  background: #fff;
  width: min(900px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e5e5;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.cadrage-modal__head {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e5e5;
  position: relative;
}

.cadrage-modal__title {
  margin: 0;
  font-size: 1.4rem;
}

.cadrage-modal__subtitle {
  margin: 0.25rem 0 0;
  color: #666;
  font-size: 0.9rem;
}

.cadrage-modal__head .fr-btn--close {
  position: absolute;
  top: 1rem;
  right: 1rem;
}

.cadrage-modal__body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.cadrage-modal__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #f0f0f0;
}

.cadrage-modal__loading {
  text-align: center;
  padding: 3rem 1rem;
}

.cadrage-spinner {
  width: 48px;
  height: 48px;
  margin: 0 auto 1rem;
  border: 4px solid #e5e5e5;
  border-top-color: #000091;
  border-radius: 50%;
  animation: cadrage-spin 0.8s linear infinite;
}

@keyframes cadrage-spin {
  to {
    transform: rotate(360deg);
  }
}

.cadrage-preview {
  margin-top: 1.5rem;
  padding: 1rem 1.25rem;
  background: #f6f6f6;
  border-left: 4px solid #000091;
}

.cadrage-preview h3 {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
}

.cadrage-preview h3 code {
  font-size: 0.85rem;
  background: #fff;
  padding: 0.1rem 0.4rem;
  margin-left: 0.5rem;
  border: 1px solid #ddd;
}

.cadrage-preview__desc {
  margin: 0.25rem 0 0.5rem;
  color: #555;
}

.cadrage-preview__counts {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  font-size: 0.95rem;
  color: #333;
}

.cadrage-errors,
.cadrage-raw {
  margin-top: 1rem;
  font-size: 0.9rem;
}

.cadrage-errors summary,
.cadrage-raw summary {
  cursor: pointer;
  padding: 0.5rem;
  background: #f6f6f6;
}

.cadrage-errors ul {
  max-height: 200px;
  overflow-y: auto;
  margin: 0.5rem 0 0;
  padding: 0.5rem 1rem 0.5rem 2rem;
  background: #fafafa;
  border: 1px solid #eee;
}

.cadrage-errors code {
  background: #fff3cd;
  padding: 0 0.3rem;
}

.cadrage-raw pre {
  max-height: 300px;
  overflow: auto;
  margin: 0.5rem 0 0;
  padding: 0.75rem;
  background: #1e1e1e;
  color: #d4d4d4;
  font-size: 0.8rem;
  line-height: 1.4;
}

.cadrage-files {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.cadrage-files li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.6rem;
  background: #f6f6f6;
  border: 1px solid #e5e5e5;
  font-size: 0.9rem;
}

.cadrage-files__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cadrage-files__size {
  color: #666;
  font-variant-numeric: tabular-nums;
}

.cadrage-refine {
  margin-top: 1.25rem;
  padding: 1rem 1.25rem;
  background: #f6f6f6;
  border-left: 4px solid #6a6af4;
}
</style>
