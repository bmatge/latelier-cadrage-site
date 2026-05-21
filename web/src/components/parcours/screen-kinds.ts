// Centralise le mapping kind → icône DSFR + accent CSS + label, partagé
// entre `StoryStepCard`, `ScreenPicker`, badges Arbo/Maquette.
//
// Couleurs choisies pour rester clairement distinguables sans trop
// charger : bleu france (interne), jaune (bloc — sous-élément d'une page),
// violet (sortie externe), gris pointillé (à résoudre).

import type { ScreenKind } from '@latelier/shared';

export interface KindStyle {
  readonly label: string;
  readonly icon: string;
  readonly accent: string;
  readonly bg: string;
  readonly border: string;
}

export const KIND_STYLES: Readonly<Record<ScreenKind, KindStyle>> = {
  ghost: {
    label: 'À définir',
    icon: 'fr-icon-question-line',
    accent: '#666',
    bg: '#f5f5f5',
    border: '2px dashed #bbb',
  },
  node: {
    label: 'Page',
    icon: 'fr-icon-file-line',
    accent: '#000091',
    bg: '#e3e3fd',
    border: '1px solid #000091',
  },
  block: {
    label: 'Bloc',
    icon: 'fr-icon-stack-line',
    accent: '#716043',
    bg: '#fef3c7',
    border: '1px solid #d4a373',
  },
  dispositif: {
    label: 'Sortie',
    icon: 'fr-icon-external-link-line',
    accent: '#6e445a',
    bg: '#f4ebf4',
    border: '1px solid #a558a0',
  },
};

export function newId(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 8);
}
