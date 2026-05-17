# Captures de la page d'aide

Ce dossier contient les illustrations affichées dans `/aide` (HelpPage.vue).

## Comment remplacer une capture

1. Faites votre capture (PNG ou SVG conseillé, max ~500 KiB pour rester fluide).
2. Enregistrez-la ici avec un nom explicite, ex. `tree-detail-panel.png`.
3. Dans `web/src/pages/HelpPage.vue`, remplacez l'attribut `src` de la `<figure>` concernée par le chemin de votre fichier (`/help/votre-fichier.png`).
4. Rebuild (`npm run -w @latelier/web build`) — Vite servira le fichier tel quel depuis `public/`.

## Captures attendues (référencées dans HelpPage.vue)

| Référence dans le code | Description suggérée |
|---|---|
| `/help/login.png` | Page de connexion par lien magique. |
| `/help/tree.png` | Page Arborescence : tree à gauche, panneau détail à droite. |
| `/help/cadrage-modal.png` | Modal Albert : upload, génération, affinage. |

Tant qu'un fichier n'existe pas, la page d'aide affiche `placeholder.svg` (le bloc gris « Capture à venir »).
