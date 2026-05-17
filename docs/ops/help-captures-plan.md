# Plan de captures pour la page `/aide`

Ce document est destiné à un agent **Claude Cowork** (ou tout opérateur
humain avec Chrome) chargé de produire les captures qui illustrent la
[page d'aide](../../web/src/pages/HelpPage.vue). Cible : la prod
`https://latelier.bercy.matge.com`, opérateur **déjà authentifié**
(cookie de session présent).

## Pré-requis

1. Être loggué sur la prod (`/login` → lien magique).
2. Disposer d'un projet « bien rempli » à pointer pour les captures
   (axes/objectifs/moyens, arbre avec quelques niveaux, maquette avec
   paragraphes, roadmap avec items, catalogue dispositifs et mesures
   non vides). Si nécessaire, importer le bundle d'exemple
   [`docs/bundle-example.json`](../bundle-example.json) sous un slug
   dédié — appelons-le `{PROJECT_SLUG}` dans ce qui suit.
3. Naviguer sur Chrome Desktop, viewport **1440 × 900** par défaut, DPR 2
   pour la qualité retina. Pour les captures « zoom composant », viewport
   peut être réduit à **1024 × 768** pour rapprocher l'élément.

## Convention de sortie

- **Format** : PNG, qualité maximale, sans optimisation lossy.
- **Cible** : déposer dans `web/public/help/` du repo, **un commit
  séparé par lot** (« feat(help): captures pages projet » d'un côté,
  « feat(help): captures composants partagés » de l'autre — facilite la
  revue / le revert).
- **Nommage** : `{rubrique}.png` ou `{composant}.png` en kebab-case.
  Liste exacte ci-dessous.

## Captures à produire

### Lot 1 — Pages L1 (7 captures pleine fenêtre)

Cadrage : viewport **1440 × 900**, capture **full page** (Chrome devtools
→ Capture full size screenshot), pas de zoom.

| #   | Fichier               | URL                              | Mise en scène attendue                                                                                                                                                               |
| --- | --------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `objectifs.png`       | `/p/{PROJECT_SLUG}/objectifs`    | Pyramide visible avec **au moins 2 axes** dont au moins un déplié (≥ 2 objectifs + ≥ 2 moyens dont 1 avec chip de nœud lié). Compteur « X / Y moyens couverts par un nœud » visible. |
| 2   | `arborescence.png` \* | `/p/{PROJECT_SLUG}/arborescence` | Arbre déplié sur ≥ 3 niveaux à gauche, **un nœud sélectionné**, panneau détail visible à droite avec ≥ 3 sections ouvertes (Configuration + Améliorations + Politiques publiques).   |
| 3   | `maquette.png`        | `/p/{PROJECT_SLUG}/maquette`     | Onglet « Particuliers » ou équivalent actif, **un nœud sélectionné à gauche**, ≥ 3 paragraphes DSFR rendus au centre, panneau droit (Propriétés CMS) déplié.                         |
| 4   | `roadmap.png`         | `/p/{PROJECT_SLUG}/roadmap`      | Axes configurés sur **Échéances en colonnes** × **Types de page en lignes**. ≥ 4 cartes visibles, dont **1 carte jaune (amélioration)** clairement distincte.                        |
| 5   | `ressources.png`      | `/p/{PROJECT_SLUG}/dispositifs`  | Master-détail avec ≥ 5 entrées dans la liste de gauche, **une entrée sélectionnée**, panneau détail droit affichant les champs (nom, catégorie, publics chips, URL, description).    |
| 6   | `modele.png`          | `/p/{PROJECT_SLUG}/modele`       | Onglet **Vocabulaires projet** actif, les **3 accordéons dépliés** (Publics cibles, Échéances, Types de page) avec ≥ 3 entrées chacun.                                               |
| 7   | `politiques.png`      | `/p/{PROJECT_SLUG}/mesures`      | Kanban axes × échéances avec ≥ 2 axes en lignes et ≥ 3 colonnes d'échéances. ≥ 5 cartes mesures réparties, dont **au moins 1 avec badge « ✓ couvert »**.                             |

\* `arborescence.png` : un `tree.png` existe déjà dans
`web/public/help/`. Si l'opérateur estime qu'il est suffisamment à jour,
le conserver tel quel sous son nom actuel — sinon le remplacer
**et conserver le nom** `tree.png` (la HelpPage le référence ainsi).

### Lot 2 — Composants partagés (3 captures rapprochées)

Cadrage : viewport **1024 × 768**, zone capturée recadrée autour du
composant (~600-800 px de large), bord visible mais sans excès de fond
neutre. Idéalement DPR 2 pour la netteté du texte.

| #   | Fichier             | Où le trouver                                                 | Mise en scène attendue                                                                                                                                                                                                 |
| --- | ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | `inline-edit.png`   | `/p/{PROJECT_SLUG}/objectifs` ou `/dispositifs`               | Un champ texte **en mode édition** : input visible, focus actif (caret), valeur déjà tapée à moitié (ex. « Réduire le délai »). Recadrer autour du champ + label si présent (~600 × 120 px).                           |
| 9   | `multi-select.png`  | Panneau détail d'un nœud sur `/p/{PROJECT_SLUG}/arborescence` | Un `MultiSelect` **dropdown ouvert** (ex. Politiques publiques) avec ≥ 2 chips déjà sélectionnées et ≥ 3 options visibles dans la dropdown. Recadrer pour inclure le label, les chips, et la dropdown (~700 × 400 px). |
| 10  | `confirm-modal.png` | Cliquer sur ❌/Supprimer d'un nœud non critique sans valider  | Modal `ConfirmModal` au centre, **fond grisé visible** autour. Recadrer pour inclure titre + texte + boutons Annuler/Confirmer (~700 × 350 px). **Annuler ensuite, ne pas confirmer.**                                 |

## Vérification finale

Une fois les 10 PNGs commités, recharger
`https://latelier.bercy.matge.com/aide` et vérifier section par section
que chaque `<img>` se charge sans tomber sur `placeholder.svg`. Si la
HelpPage ne référence pas encore une image attendue, le composant
`onImgError` retombera sur le placeholder — ce qui signale qu'il faut
soit ajouter le `<img>` dans `HelpPage.vue`, soit corriger le nom de
fichier.

> **Note pour les contributeurs futurs** : la HelpPage actuelle ne
> référence encore que `login.png`, `tree.png` et `cadrage-modal.png`.
> L'ajout des 7 autres `<img>` dans le template est une étape séparée
> à coordonner avec ce lot — voir issue/PR liée.

## Anti-checklist (à ne pas faire)

- ❌ Ne **pas** capturer d'éléments en mode « bac à sable anonyme » :
  le bandeau « Mode brouillon local » polluerait visuellement la doc.
  → Toujours partir d'une session admin/editor authentifiée.
- ❌ Ne **pas** afficher d'email perso, de token, ou de nom propre
  identifiable dans la capture. Si le menu UserMenu doit être ouvert,
  flouter l'email avant export.
- ❌ Ne **pas** capturer en mode mobile (sidemenu DSFR collapse, layout
  empilé) : ce n'est pas la cible visuelle de la doc d'aide actuelle.
- ❌ Ne **pas** committer en cas d'erreur 500 / écran vide ; signaler
  d'abord le problème (probablement un bug isolé à corriger avant la
  capture).
