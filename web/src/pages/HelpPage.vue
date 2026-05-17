<script setup lang="ts">
// Page d'aide / guide d'utilisation de L'atelier 🪢. Publique (pas d'auth).
// Menu latéral DSFR officiel (fr-sidemenu) + scroll-spy minimal pour
// mettre à jour l'aria-current selon la section visible.

import { onMounted, onUnmounted, ref } from 'vue';
import { getCadrageStatus, type CadrageStatus } from '../api/cadrage.api.js';
import PageHeader from '../components/ui/PageHeader.vue';

const cadrageStatus = ref<CadrageStatus>({ enabled: false, configured: false, model: null });
const activeId = ref<string>('concept');

const sections = [
  { id: 'concept', label: '1. Concept' },
  { id: 'onboarding', label: '2. Onboarding' },
  { id: 'creer-projet', label: '3. Créer un projet' },
  { id: 'editer-projet', label: '4. Éditer un projet' },
  { id: 'collaborer', label: '5. Collaborer' },
  { id: 'exporter', label: '6. Exporter / réimporter' },
  { id: 'roles', label: '7. Rôles et permissions' },
  { id: 'personnaliser', label: '8. Vocabulaires projet' },
  { id: 'faq', label: '9. FAQ' },
];

// Scroll-spy via IntersectionObserver : marque comme actif la section
// dont le titre est en haut de la viewport. rootMargin négatif pour
// déclencher tôt (avant que le titre n'atteigne le top).
let observer: IntersectionObserver | null = null;

onMounted(async () => {
  cadrageStatus.value = await getCadrageStatus();
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) activeId.value = visible[0].target.id;
    },
    { rootMargin: '0px 0px -70% 0px', threshold: 0 },
  );
  for (const s of sections) {
    const el = document.getElementById(s.id);
    if (el) observer.observe(el);
  }
});

onUnmounted(() => {
  observer?.disconnect();
});

// Fallback : si la capture n'a pas encore été déposée dans web/public/help/,
// on retombe sur le placeholder partagé.
function onImgError(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (img.src.endsWith('/help/placeholder.svg')) return;
  img.src = '/help/placeholder.svg';
}
</script>

<template>
  <div class="fr-grid-row fr-grid-row--gutters help-grid">
    <!-- Menu latéral DSFR officiel : fr-sidemenu + fr-sidemenu--sticky-full-height -->
    <div class="fr-col-12 fr-col-md-3">
      <nav
        class="fr-sidemenu fr-sidemenu--sticky-full-height"
        role="navigation"
        aria-labelledby="fr-sidemenu-title"
      >
        <div class="fr-sidemenu__inner">
          <button
            class="fr-sidemenu__btn"
            hidden
            aria-controls="fr-sidemenu-wrapper"
            aria-expanded="false"
          >
            Dans cette page
          </button>
          <div class="fr-collapse" id="fr-sidemenu-wrapper">
            <div class="fr-sidemenu__title" id="fr-sidemenu-title">Sommaire</div>
            <ul class="fr-sidemenu__list">
              <li
                v-for="s in sections"
                :key="s.id"
                class="fr-sidemenu__item"
                :class="{ 'fr-sidemenu__item--active': activeId === s.id }"
              >
                <a
                  class="fr-sidemenu__link"
                  :href="`#${s.id}`"
                  :aria-current="activeId === s.id ? 'page' : undefined"
                >
                  {{ s.label }}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </div>

    <article class="fr-col-12 fr-col-md-9 help-content">
      <PageHeader
        title="Guide de L'atelier 🪢"
        subtitle="Cartographier l'arborescence, la roadmap, les ressources et les politiques publiques d'un site institutionnel — avant de le construire dans Drupal."
      />

      <!-- ============================================================ -->
      <section id="concept">
        <h2>1 · Le concept</h2>
        <p>
          <strong>L'atelier</strong> est un outil multi-projets de <em>cadrage</em> de sites
          institutionnels. Chaque projet décrit le futur site avant qu'il ne soit construit :
          quelles pages, quelles politiques publiques rattachées, quels services tiers à pointer,
          quels objectifs stratégiques, quelle modélisation Drupal.
        </p>
        <p>
          Un projet est éditable à plusieurs (commentaires, historique des révisions, RBAC). Il peut
          être <strong>exporté en un fichier JSON unique</strong> (le « bundle ») qu'on peut
          partager, archiver, ou réimporter dans une autre instance.
        </p>
        <div class="help-callout">
          <strong>Le bundle est la pierre angulaire.</strong> Toute la donnée d'un projet — arbre,
          roadmap, vocabulaires, catalogues, structure CMS — tient dans un seul JSON conforme à
          <a
            href="https://github.com/bmatge/latelier-cadrage-site/blob/main/docs/bundle-format.md"
            target="_blank"
            rel="noopener"
            >docs/bundle-format.md</a
          >. C'est ce qui rend possible l'import IA, l'archivage, et les copies entre projets.
        </div>
      </section>

      <!-- ============================================================ -->
      <section id="onboarding">
        <h2>2 · Premier accès (onboarding)</h2>
        <ol>
          <li>
            <strong>Demandez un lien magique</strong> sur
            <RouterLink to="/login">/login</RouterLink>. Aucun mot de passe — un email avec un lien
            d'activation vous est envoyé (valide 15 min).
          </li>
          <li>
            <strong>Cliquez le lien</strong> dans votre boîte : une session est ouverte
            automatiquement. Le compte est créé en self-signup avec le rôle
            <code>viewer</code> global.
          </li>
          <li>
            Pour <strong>créer ou éditer</strong> des projets, demandez à un admin de vous attribuer
            un rôle <code>editor</code> (global ou par projet).
          </li>
        </ol>

        <figure>
          <img
            :src="`/help/login.png`"
            alt="Page de connexion par lien magique"
            @error="onImgError"
          />
          <figcaption>La page de connexion ne demande qu'une adresse email.</figcaption>
        </figure>
      </section>

      <!-- ============================================================ -->
      <section id="creer-projet">
        <h2>3 · Créer un projet</h2>
        <p>Trois méthodes, regroupées dans le bloc « Créer un projet » de la home :</p>

        <h3>3.1 · Vide (formulaire)</h3>
        <p>
          Vous démarrez avec une racine et trois vocabulaires par défaut très minimalistes (1
          audience, 3 échéances, 3 types de page). C'est à vous de remplir l'arborescence à partir
          d'une page blanche.
        </p>
        <p>
          <strong>Champs</strong> : nom (jusqu'à 100 caractères), slug technique (regex
          <code>[a-z0-9-]</code>, 50 max — auto-généré depuis le nom à la perte de focus),
          description (max 500 caractères, optionnel).
        </p>

        <h3>
          3.2 · Via IA (Albert / DINUM)
          <span v-if="!cadrageStatus.enabled" class="help-badge"
            >indisponible sur cette instance</span
          >
        </h3>
        <p v-if="cadrageStatus.enabled">
          Albert
          <span v-if="cadrageStatus.model"
            >(modèle <code>{{ cadrageStatus.model }}</code
            >)</span
          >
          analyse <strong>un ou plusieurs documents</strong> que vous lui fournissez (PDF, DOCX,
          CSV, TXT, MD — jusqu'à {{ cadrageStatus.maxFiles ?? 5 }} fichiers,
          {{ cadrageStatus.maxFileMiB ?? 10 }} MiB chacun) et propose une première arborescence +
          roadmap + catalogues + structure Drupal, dans le format de bundle directement importable.
        </p>
        <p v-else>
          Cette fonction est activée par flag (<code>CADRAGE_ENABLED=1</code>) côté serveur et
          requiert une clé API Albert. Sur cette instance elle est désactivée.
        </p>

        <p v-if="cadrageStatus.enabled">Workflow :</p>
        <ol v-if="cadrageStatus.enabled">
          <li>Cliquer sur la card « Via IA » de la home → la modal s'ouvre.</li>
          <li>
            Glisser un ou plusieurs documents source + optionnellement quelques consignes (« cible :
            agents des collectivités », « scope strict aux aides ANAH »…).
          </li>
          <li>
            Albert répond en 10-60 secondes. Le bundle proposé est affiché avec un aperçu (nom,
            slug, nombre de rubriques, mesures, dispositifs…).
          </li>
          <li>
            Si le résultat n'est pas parfait, utiliser le champ <strong>Affiner</strong> en bas :
            décrire en français ce qu'il faut changer (« renomme l'axe 1 », « ajoute un dispositif
            »). Albert renvoie une nouvelle version, garde le reste intact. Itérez autant que
            nécessaire.
          </li>
          <li>
            Cliquer sur <strong>Importer ce projet</strong> : le projet est créé, vous êtes redirigé
            sur son arborescence.
          </li>
        </ol>

        <figure v-if="cadrageStatus.enabled">
          <img
            :src="`/help/cadrage-modal.png`"
            alt="Modal de cadrage IA en cours de génération"
            @error="onImgError"
          />
          <figcaption>Modal Albert : upload de documents, résultat, champ d'affinage.</figcaption>
        </figure>

        <h3>3.3 · Depuis un bundle</h3>
        <p>
          Importez un fichier JSON exporté d'un autre atelier, ou produit par une IA via le
          <a
            href="https://github.com/bmatge/latelier-cadrage-site/blob/main/docs/prompt-cadrage.md"
            target="_blank"
            rel="noopener"
            >prompt de cadrage</a
          >
          (à coller dans Claude.ai / ChatGPT). Le slug est conservé si libre, sinon suffixé
          <code>-2</code>, <code>-3</code>…
        </p>
        <p>
          Le serveur normalise les divergences de format à l'import (cf.
          <a
            href="https://github.com/bmatge/latelier-cadrage-site/blob/main/docs/bundle-format.md#champs-legacy-à-éviter"
            target="_blank"
            rel="noopener"
            >champs legacy</a
          >) : <code>audience</code> singulier devient <code>audiences[]</code>, les listes d'objets
          <code>[{key,label}]</code> redeviennent des strings là où c'est attendu, etc. Vous pouvez
          donc importer en toute confiance un bundle ancien ou produit par un LLM imparfait.
        </p>
      </section>

      <!-- ============================================================ -->
      <section id="editer-projet">
        <h2>4 · Éditer un projet</h2>
        <p>Une fois dans un projet, 8 onglets sont disponibles dans la barre de navigation :</p>

        <h3>4.1 · Objectifs du site</h3>
        <p>
          Pyramide stratégique en 3 niveaux : <strong>axes</strong> (orientation), →
          <strong>objectifs</strong> (résultats visés), → <strong>moyens</strong> (actions
          concrètes, rattachables à des nœuds du tree et à des dispositifs).
        </p>

        <h3>4.2 · Arborescence</h3>
        <p>
          L'arbre des pages du futur site, éditable en drag-drop. Cliquer sur un nœud ouvre un
          panneau détail à droite avec 7 sections : blocs éditoriaux, améliorations prévues, mesures
          rattachées, dispositifs liés, objectifs liés, maquette, commentaires.
        </p>
        <figure>
          <img
            :src="`/help/tree.png`"
            alt="Page Arborescence avec panneau détail"
            @error="onImgError"
          />
          <figcaption>Arborescence : drag-drop côté gauche, panneau détail côté droit.</figcaption>
        </figure>

        <h3>4.3 · Maquette</h3>
        <p>
          Édition inline-on-preview des pages : on voit le rendu DSFR à droite, et chaque champ
          éditable se transforme en input au clic. Couvre 17 schémas de paragraphes (accordion,
          tabs, cards-row, callout, image-text…) — la liste complète est dans
          <code>shared/src/dsfr-paragraphs.ts</code>.
        </p>

        <h3>4.4 · Roadmap</h3>
        <p>
          Grille croisant deux axes configurables (par défaut « jalons temporels » × « actions »).
          Les items de roadmap sont des user stories rattachées à des nœuds de l'arbre et à des
          dispositifs.
        </p>

        <h3>4.5 · Ressources & services (dispositifs)</h3>
        <p>
          Catalogue des outils, plateformes, simulateurs ou services existants susceptibles d'être
          pointés ou intégrés. Master-détail avec filtres par catégorie et public.
        </p>

        <h3>4.6 · Modèle de données</h3>
        <p>Deux onglets internes :</p>
        <ul>
          <li>
            <strong>Vocabulaires</strong> : audiences, échéances, types de page éditables par
            projet. Modifier ici met à jour les chips affichés partout dans le projet.
          </li>
          <li>
            <strong>Structure CMS</strong> : types de contenu Drupal, paragraphes activés,
            taxonomies. Sert à l'export Drupal final.
          </li>
        </ul>

        <h3>4.7 · Politiques publiques (mesures)</h3>
        <p>
          Kanban des mesures du plan ou de la stratégie sur laquelle s'aligne le site. Filtre par
          axe et par public. CRUD inline.
        </p>

        <h3>4.8 · Historique</h3>
        <p>
          Toutes les révisions de l'arborescence (chaque PUT crée une révision). Diff visuel ajouts
          / suppressions / modifications, possibilité de revert vers n'importe quelle version
          antérieure.
        </p>
      </section>

      <!-- ============================================================ -->
      <section id="collaborer">
        <h2>5 · Collaborer à plusieurs</h2>
        <h3>5.1 · Public / privé</h3>
        <p>
          Chaque projet porte un flag <code>is_public</code>. Si <code>true</code>, toutes les
          routes <code>GET</code> (consultation) sont ouvertes aux visiteurs
          <em>non authentifiés</em>. Les écritures restent strictement protégées.
        </p>
        <p>Toggle via PATCH côté API ou via le menu admin du projet.</p>

        <h3>5.2 · Bac à sable anonyme</h3>
        <p>
          Un visiteur non identifié peut <strong>tester des modifications localement</strong>
          (IndexedDB du navigateur) sans toucher au serveur. Modal implicite à la première tentative
          d'édition. Bouton « Exporter mon brouillon » qui produit un bundle JSON ré-importable par
          un admin.
        </p>

        <h3>5.3 · Commentaires</h3>
        <p>
          Sur chaque nœud de l'arbre, un fil de commentaires (panneau détail). Permet de tracer les
          questions / décisions en parallèle de l'édition.
        </p>

        <h3>5.4 · Historique</h3>
        <p>
          Toutes les modifications du tree créent une nouvelle révision. L'onglet Historique montre
          l'auteur, le message, la date, et permet de revenir en arrière.
        </p>
      </section>

      <!-- ============================================================ -->
      <section id="exporter">
        <h2>6 · Exporter et réimporter</h2>
        <p>
          Depuis la home, bouton <strong>Exporter</strong> à côté de chaque projet : téléchargement
          d'un fichier <code>bundle-{slug}-{date}.json</code>. Format documenté dans
          <a
            href="https://github.com/bmatge/latelier-cadrage-site/blob/main/docs/bundle-format.md"
            target="_blank"
            rel="noopener"
            >docs/bundle-format.md</a
          >.
        </p>
        <p>
          Le bundle contient tout l'état courant : projet (slug, nom, description), arbre, roadmap,
          5 catalogues (vocab, dispositifs, mesures, objectifs, drupal_structure).
          <em>Pas</em> l'historique des révisions, <em>pas</em> les commentaires.
        </p>
        <p>
          Vous pouvez le réimporter via la card « Depuis un bundle » de la home. Utile pour :
          dupliquer un projet comme template, sauvegarder une version, partager un cadrage avec un
          collègue qui n'a pas accès à cette instance.
        </p>
      </section>

      <!-- ============================================================ -->
      <section id="roles">
        <h2>7 · Rôles et permissions</h2>
        <p>
          Trois rôles, attribuables au niveau global (tous projets) ou par projet
          (<code>project_id</code>) :
        </p>
        <table>
          <thead>
            <tr>
              <th>Rôle</th>
              <th>Lecture</th>
              <th>Écriture</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>viewer</code></td>
              <td>Projets publics + projets où grant explicite</td>
              <td>—</td>
              <td>—</td>
            </tr>
            <tr>
              <td><code>editor</code></td>
              <td>Idem viewer</td>
              <td>
                Tree, roadmap, data, commentaires, import bundle (global), création de projet
                (global)
              </td>
              <td>—</td>
            </tr>
            <tr>
              <td><code>admin</code></td>
              <td>Tous projets</td>
              <td>Tout</td>
              <td>Page /admin, attribution de rôles, suppression de projets d'autrui, audit log</td>
            </tr>
          </tbody>
        </table>
        <p>
          Le self-signup donne <code>viewer</code> global. Un premier admin est créé via
          <code>BOOTSTRAP_ADMIN_EMAILS</code> au démarrage du serveur, puis les rôles se gèrent via
          la page <code>/admin</code>.
        </p>
      </section>

      <!-- ============================================================ -->
      <section id="personnaliser">
        <h2>8 · Personnaliser le vocabulaire d'un projet</h2>
        <p>
          Chaque projet définit son propre vocabulaire dans l'onglet
          <strong>Modèle de données</strong> :
        </p>
        <ul>
          <li>
            <code>audiences</code> : publics cibles (ex. <code>particuliers</code>,
            <code>pros</code>, <code>collectivites</code>). Affichés en chips colorés.
          </li>
          <li>
            <code>deadlines</code> : échéances (ex. <code>juin</code>, <code>septembre</code>,
            <code>y2027</code>). Servent au tri et au filtre.
          </li>
          <li>
            <code>page_types</code> : types de page (ex. <code>hub</code>, <code>editorial</code>,
            <code>service</code>, <code>simulator</code>). Affichés en badge sur chaque nœud.
          </li>
        </ul>
        <p>
          Toute modification ici se répercute immédiatement sur l'affichage de l'arborescence, de la
          roadmap et des mesures (cf.
          <a
            href="https://github.com/bmatge/latelier-cadrage-site/blob/main/docs/bundle-format.md"
            target="_blank"
            rel="noopener"
            >ADR-009</a
          >).
        </p>
      </section>

      <!-- ============================================================ -->
      <section id="faq">
        <h2>9 · FAQ</h2>
        <details>
          <summary>
            Mon import IA renvoie « bundle généré, non conforme au schéma » — je peux quand même
            importer ?
          </summary>
          <p>
            Oui. L'app est volontairement tolérante à l'import : les erreurs ajv sont des
            <em>recommandations</em>, pas des blocages. Le serveur normalise les divergences connues
            (audiences, options, categories). Importez puis ajustez si quelque chose ne s'affiche
            pas bien.
          </p>
        </details>
        <details>
          <summary>
            Comment partager un projet à un collègue qui n'est pas sur cette instance ?
          </summary>
          <p>
            Exportez le bundle (bouton « Exporter » sur la home), envoyez-lui le fichier
            <code>.json</code>, il l'importe via la card « Depuis un bundle ».
          </p>
        </details>
        <details>
          <summary>Comment basculer un projet en privé ?</summary>
          <p>
            Depuis le projet, badge « Public » → cliquer pour passer en privé (permission
            <code>project:update</code> requise). Les visiteurs anonymes n'auront plus accès aux
            routes <code>GET</code> du projet.
          </p>
        </details>
        <details>
          <summary>J'ai supprimé un projet par erreur, comment le récupérer ?</summary>
          <p>
            Si vous l'aviez exporté avant : réimporter le bundle. Sinon, demander à un admin de
            restaurer depuis le backup SQLite (rétention 30 j en prod, cf.
            <code>docs/ops/restore.md</code>).
          </p>
        </details>
        <details>
          <summary>
            Albert produit des champs qui n'existent pas dans le schéma — qu'est-ce qui se passe ?
          </summary>
          <p>
            Les champs inconnus du schéma sont silencieusement ignorés à l'import. Les 5 clés
            <code>data.*</code> autorisées sont : <code>vocab</code>, <code>dispositifs</code>,
            <code>mesures</code>, <code>objectifs</code>, <code>drupal_structure</code>. Tout le
            reste sous <code>data.*</code> est jeté.
          </p>
        </details>
        <details>
          <summary>Combien d'utilisateurs simultanés sur un même projet ?</summary>
          <p>
            Pas de limite stricte. Optimistic locking sur le tree et la roadmap (header
            <code>If-Match: revision_id</code>) : si quelqu'un sauve en même temps que vous, vous
            recevez un 409 conflict et devez recharger.
          </p>
        </details>
      </section>
    </article>
  </div>
</template>

<style scoped>
/* La grille et le menu latéral sont 100% DSFR (fr-grid-row + fr-sidemenu).
   On ne style que le contenu de l'article et quelques helpers locaux. */

.help-grid {
  max-width: 1200px;
  margin: 0 auto;
}

.help-content {
  min-width: 0;
}

.help-content section {
  margin-bottom: 3rem;
  padding-top: 1rem;
  scroll-margin-top: 1rem;
}

.help-content h2 {
  font-size: 1.6rem;
  margin: 0 0 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-default-grey, #ddd);
}

.help-content h3 {
  font-size: 1.15rem;
  margin: 1.5rem 0 0.5rem;
}

.help-content p,
.help-content li {
  line-height: 1.55;
}

.help-content code {
  background: #f0f0f0;
  padding: 0 0.3em;
  font-size: 0.92em;
}

.help-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.95rem;
}

.help-content th,
.help-content td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border-default-grey, #eee);
  vertical-align: top;
}

.help-content th {
  background: #f6f6f6;
  font-weight: 600;
}

.help-content details {
  margin: 0.6rem 0;
  padding: 0.6rem 0.9rem;
  background: #f9f9f9;
  border: 1px solid #eee;
  border-radius: 4px;
}

.help-content details summary {
  cursor: pointer;
  font-weight: 500;
}

.help-content details p {
  margin: 0.6rem 0 0;
}

.help-callout {
  padding: 0.9rem 1.1rem;
  margin: 1rem 0;
  background: var(--background-alt-blue-france, #eef0ff);
  border-left: 4px solid var(--text-action-high-blue-france, #000091);
  font-size: 0.95rem;
}

.help-content figure {
  margin: 1.25rem 0;
  padding: 0.5rem;
  background: #fafafa;
  border: 1px solid #eee;
}

.help-content figure img {
  max-width: 100%;
  display: block;
  margin: 0 auto;
}

.help-content figure figcaption {
  text-align: center;
  font-size: 0.85rem;
  color: #666;
  margin-top: 0.5rem;
  font-style: italic;
}

.help-badge {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.1rem 0.5rem;
  background: #f6f6f6;
  border: 1px solid #ddd;
  font-size: 0.7rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  vertical-align: middle;
}

/* Sur mobile : le sidemenu DSFR collapse automatiquement via le bouton
   « Dans cette page » (fr-sidemenu__btn). Notre seule contrainte est
   de ne pas le rendre sticky en colonne empilée — DSFR gère déjà
   `fr-sidemenu--sticky-full-height` côté responsive. */
</style>
