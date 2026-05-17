<script setup lang="ts">
// Wrapper minimal pour les modales full-screen de l'app. Backdrop noir
// cliquable (ferme), frame blanche centrée, header avec titre +
// sous-titre + bouton fermer, body scrollable, footer optionnel.
//
// Pas une fr-modal officielle DSFR (qui s'appuie sur <dialog> + l'API
// dsfr.modal) — on garde notre propre layout pour le contrôle plein de
// la taille et du backdrop, mais on reste cohérent visuellement avec le
// reste de l'app.

defineProps<{
  readonly open: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly size?: 'sm' | 'md' | 'lg';
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <div
    v-if="open"
    class="app-modal__backdrop"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    @click.self="emit('close')"
  >
    <div class="app-modal" :class="`app-modal--${size ?? 'md'}`">
      <header class="app-modal__head">
        <h2 class="app-modal__title">{{ title }}</h2>
        <p v-if="subtitle" class="app-modal__subtitle">{{ subtitle }}</p>
        <button
          type="button"
          class="fr-btn--close fr-btn"
          aria-label="Fermer"
          @click="emit('close')"
        >
          Fermer
        </button>
      </header>

      <div class="app-modal__body">
        <slot />
      </div>

      <footer v-if="$slots['footer']" class="app-modal__footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.app-modal__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(22, 22, 22, 0.65);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.app-modal {
  background: #fff;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e5e5;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.app-modal--sm {
  max-width: 520px;
}
.app-modal--md {
  max-width: 720px;
}
.app-modal--lg {
  max-width: 900px;
}

.app-modal__head {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e5e5;
  position: relative;
}

.app-modal__title {
  margin: 0;
  font-size: 1.4rem;
}

.app-modal__subtitle {
  margin: 0.25rem 0 0;
  color: #666;
  font-size: 0.9rem;
}

.app-modal__head .fr-btn--close {
  position: absolute;
  top: 1rem;
  right: 1rem;
}

.app-modal__body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.app-modal__footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f0f0f0;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>
