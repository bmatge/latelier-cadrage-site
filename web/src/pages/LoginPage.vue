<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import PageHeader from '../components/ui/PageHeader.vue';

const email = ref('');
const sent = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

// Message affiché si on arrive sur /login depuis une redirection serveur
// (callback magic link en échec : re-clic d'un email déjà consommé, token
// expiré, ou lien malformé). Le code est passé en `?error=...`.
const linkErrorCode = ref<string | null>(null);

const linkErrorMessage = computed<string | null>(() => {
  switch (linkErrorCode.value) {
    case 'invalid_or_expired_link':
      return 'Ce lien de connexion a déjà été utilisé ou a expiré (durée de vie 15 minutes). Si vous êtes déjà connecté, accédez directement à la liste des projets — sinon demandez un nouveau lien ci-dessous.';
    case 'invalid_link':
      return 'Le lien reçu est mal formé. Demandez un nouveau lien ci-dessous.';
    default:
      return null;
  }
});

onMounted(() => {
  const err = route.query['error'];
  if (typeof err === 'string' && err.length > 0) {
    linkErrorCode.value = err;
  }
});

function clearLinkError(): void {
  if (linkErrorCode.value === null) return;
  linkErrorCode.value = null;
  // Retire `?error=...` de l'URL pour qu'un reload ne le ramène pas.
  void router.replace({ path: route.path, query: {} });
}

async function submit(): Promise<void> {
  error.value = null;
  submitting.value = true;
  clearLinkError();
  try {
    await auth.requestLogin(email.value);
    sent.value = true;
  } catch {
    error.value = 'Impossible de demander le lien magique. Réessaie dans une minute.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="l-container--narrow" style="max-width: 480px; margin: 2rem auto">
    <PageHeader
      title="Connexion"
      subtitle="Indiquez votre adresse email. Un lien magique vous sera envoyé pour vous connecter sans mot de passe — il expire après 15 minutes."
    />

    <div v-if="linkErrorMessage" class="alert alert-warning link-error">
      {{ linkErrorMessage }}
      <p style="margin: 0.5rem 0 0">
        <RouterLink to="/" class="fr-link">Accéder à la liste des projets →</RouterLink>
      </p>
    </div>

    <div class="panel-card">
      <form v-if="!sent" @submit.prevent="submit">
        <label class="field">
          <span>Adresse email</span>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="fr-input"
            placeholder="prenom.nom@example.fr"
            :disabled="submitting"
          />
        </label>
        <p v-if="error" class="alert alert-error">{{ error }}</p>
        <p style="margin-top: 1rem">
          <button
            class="fr-btn fr-icon-mail-line fr-btn--icon-left"
            type="submit"
            :disabled="submitting"
          >
            {{ submitting ? 'Envoi…' : 'Recevoir le lien' }}
          </button>
        </p>
      </form>
      <div v-else class="alert alert-success">
        <strong>📬 Lien envoyé.</strong> Si un compte existe pour <code>{{ email }}</code
        >, un email vient d'être envoyé. Vérifiez votre boîte (et les spams).
      </div>
    </div>
    <p style="margin-top: 1.5rem; font-size: 0.9rem; color: #666">
      Pas encore de compte ? Le lien magique le créera automatiquement avec le rôle
      <strong>viewer</strong> (consultation des projets publics).
      <RouterLink to="/">Retour à la liste des projets</RouterLink>.
    </p>
  </div>
</template>

<style scoped>
.link-error {
  margin-bottom: 1rem;
  font-size: 0.92rem;
  line-height: 1.5;
}
</style>
