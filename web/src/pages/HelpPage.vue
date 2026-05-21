<script setup lang="ts">
// Page d'aide / guide d'utilisation de L'atelier 🪢. Publique (pas d'auth).
// Menu latéral DSFR officiel (fr-sidemenu) à 2 niveaux : une rubrique L1
// par « partie » de l'app, sous-section L2 pour chaque action de gestion.
// Le scroll-spy met à jour l'aria-current sur la sous-section visible ;
// le L1 actif est dérivé (computed) → la sous-liste correspondante est dépliée.

import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getCadrageStatus, type CadrageStatus } from '../api/cadrage.api.js';
import PageHeader from '../components/ui/PageHeader.vue';

type SubSection = { id: string; label: string };
type Section = { id: string; label: string; children: SubSection[] };

const cadrageStatus = ref<CadrageStatus>({ enabled: false, configured: false, model: null });
const activeId = ref<string>('concept');

const sections: Section[] = [
  {
    id: 'apercu',
    label: '1. Aperçu de l’atelier',
    children: [
      { id: 'concept', label: 'Le concept' },
      { id: 'onboarding', label: 'Premier accès' },
      { id: 'creer-projet', label: 'Créer un projet' },
      { id: 'editer-projet', label: 'Les 8 onglets d’un projet' },
      { id: 'collaborer', label: 'Collaborer à plusieurs' },
      { id: 'exporter', label: 'Exporter / réimporter' },
      { id: 'roles', label: 'Rôles et permissions' },
      { id: 'personnaliser', label: 'Vocabulaires projet' },
      { id: 'faq', label: 'FAQ' },
    ],
  },
  {
    id: 'objectifs',
    label: '2. Objectifs',
    children: [
      { id: 'objectifs-pyramide', label: 'La pyramide à 3 niveaux' },
      { id: 'objectifs-crud', label: 'Créer, renommer, déplacer, supprimer' },
      { id: 'objectifs-liens', label: 'Lier les moyens aux nœuds' },
      { id: 'objectifs-import', label: 'Import / export / reset' },
    ],
  },
  {
    id: 'arborescence',
    label: '3. Arborescence',
    children: [
      { id: 'arbo-navigation', label: 'Naviguer dans l’arbre' },
      { id: 'arbo-crud', label: 'Créer, déplacer, supprimer' },
      { id: 'arbo-detail', label: 'Le panneau détail (7 sections)' },
      { id: 'arbo-liens', label: 'Liens vers les catalogues' },
      { id: 'arbo-historique', label: 'Sauvegarde et conflits' },
    ],
  },
  {
    id: 'maquette',
    label: '4. Maquette',
    children: [
      { id: 'maquette-navigation', label: 'Onglets et panneaux' },
      { id: 'maquette-paragraphes', label: 'Paragraphes DSFR' },
      { id: 'maquette-edition', label: 'Édition inline' },
      { id: 'maquette-proprietes', label: 'Propriétés CMS du nœud' },
      { id: 'maquette-import', label: 'Import / export de la maquette' },
    ],
  },
  {
    id: 'roadmap',
    label: '5. Roadmap',
    children: [
      { id: 'roadmap-axes', label: 'Axes X et Y configurables' },
      { id: 'roadmap-cartes', label: 'Cartes nœuds et améliorations' },
      { id: 'roadmap-dnd', label: 'Drag-and-drop d’échéance' },
    ],
  },
  {
    id: 'ressources',
    label: '6. Ressources',
    children: [
      { id: 'ressources-catalogue', label: 'Catalogue master-détail' },
      { id: 'ressources-crud', label: 'Champs d’un dispositif' },
      { id: 'ressources-filtres', label: 'Filtres et recherche' },
      { id: 'ressources-import', label: 'Import / export / reset' },
    ],
  },
  {
    id: 'modele',
    label: '7. Modèle de données',
    children: [
      { id: 'modele-vocab', label: 'Vocabulaires projet' },
      { id: 'modele-cms', label: 'Structure CMS' },
    ],
  },
  {
    id: 'politiques',
    label: '8. Politiques',
    children: [
      { id: 'politiques-kanban', label: 'Kanban axes × échéances' },
      { id: 'politiques-crud', label: 'Créer, éditer, supprimer' },
      { id: 'politiques-couverture', label: 'Couverture par les nœuds' },
    ],
  },
  {
    id: 'parcours',
    label: '9. Parcours utilisateur',
    children: [
      { id: 'parcours-concept', label: 'Hiérarchie : parcours et user stories' },
      { id: 'parcours-screens', label: 'Les 4 types d’écran' },
      { id: 'parcours-promotion', label: 'Créer depuis le picker' },
      { id: 'parcours-branches', label: 'Embranchements conditionnels' },
      { id: 'parcours-drag', label: 'Drag-and-drop : tout est déplaçable' },
    ],
  },
];

// L1 actif = section dont l'id correspond à activeId, OU section qui contient
// la sous-section active. Utilisé pour : (1) afficher la sous-liste dépliée,
// (2) marquer le L1 comme « parent actif » dans le menu.
const activeL1 = computed<string>(() => {
  for (const s of sections) {
    if (s.id === activeId.value) return s.id;
    if (s.children.some((c) => c.id === activeId.value)) return s.id;
  }
  return sections[0]?.id ?? 'apercu';
});

// Scroll-spy via IntersectionObserver : marque comme actif la première
// section visible (sous-section ou L1 sans enfant scrollé). rootMargin
// négatif pour déclencher tôt, avant que le titre n'atteigne le top.
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
  const allIds = sections.flatMap((s) => [s.id, ...s.children.map((c) => c.id)]);
  for (const id of allIds) {
    const el = document.getElementById(id);
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
    <!-- Menu latéral DSFR officiel : fr-sidemenu à 2 niveaux. Le L1 actif
         déplie sa sous-liste (via classe locale) ; les autres L1 restent
         repliés. Cliquer sur un L1 scrolle vers son intro de section. -->
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
                :class="{
                  'fr-sidemenu__item--active': activeL1 === s.id,
                  'help-sidemenu__item--open': activeL1 === s.id,
                }"
              >
                <a
                  class="fr-sidemenu__link help-sidemenu__l1"
                  :href="`#${s.id}`"
                  :aria-current="activeId === s.id ? 'page' : undefined"
                >
                  {{ s.label }}
                </a>
                <ul class="fr-sidemenu__list help-sidemenu__sublist">
                  <li
                    v-for="c in s.children"
                    :key="c.id"
                    class="fr-sidemenu__item"
                    :class="{ 'fr-sidemenu__item--active': activeId === c.id }"
                  >
                    <a
                      class="fr-sidemenu__link"
                      :href="`#${c.id}`"
                      :aria-current="activeId === c.id ? 'page' : undefined"
                    >
                      {{ c.label }}
                    </a>
                  </li>
                </ul>
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
      <!-- 1 · APERÇU DE L'ATELIER                                       -->
      <!-- ============================================================ -->
      <section id="apercu" class="help-section-l1">
        <h2>1 · Aperçu de l’atelier</h2>
        <p>
          Cette rubrique présente le concept général, l’onboarding, la création de projets et les
          mécanismes transverses (collaboration, rôles, export). Pour la gestion détaillée de chaque
          partie, voyez les rubriques 2 à 8.
        </p>

        <section id="concept">
          <h3>Le concept</h3>
          <p>
            <strong>L’atelier</strong> est un outil multi-projets de <em>cadrage</em> de sites
            institutionnels. Chaque projet décrit le futur site avant qu’il ne soit construit :
            quelles pages, quelles politiques publiques rattachées, quels services tiers à pointer,
            quels objectifs stratégiques, quelle modélisation Drupal.
          </p>
          <p>
            Un projet est éditable à plusieurs (commentaires, historique des révisions, RBAC). Il
            peut être <strong>exporté en un fichier JSON unique</strong> (le « bundle ») qu’on peut
            partager, archiver, ou réimporter dans une autre instance.
          </p>
          <div class="help-callout">
            <strong>Le bundle est la pierre angulaire.</strong> Toute la donnée d’un projet — arbre,
            roadmap, vocabulaires, catalogues, structure CMS — tient dans un seul JSON conforme à
            <a
              href="https://github.com/bmatge/latelier-cadrage-site/blob/main/docs/bundle-format.md"
              target="_blank"
              rel="noopener"
              >docs/bundle-format.md</a
            >. C’est ce qui rend possible l’import IA, l’archivage, et les copies entre projets.
          </div>
        </section>

        <section id="onboarding">
          <h3>Premier accès (onboarding)</h3>
          <ol>
            <li>
              <strong>Demandez un lien magique</strong> sur
              <RouterLink to="/login">/login</RouterLink>. Aucun mot de passe — un email avec un
              lien d’activation vous est envoyé (valide 15 min).
            </li>
            <li>
              <strong>Cliquez le lien</strong> dans votre boîte : une session est ouverte
              automatiquement. Le compte est créé en self-signup avec le rôle
              <code>viewer</code> global.
            </li>
            <li>
              Pour <strong>créer ou éditer</strong> des projets, demandez à un admin de vous
              attribuer un rôle <code>editor</code> (global ou par projet).
            </li>
          </ol>

          <figure>
            <img
              :src="`/help/login.png`"
              alt="Page de connexion par lien magique"
              @error="onImgError"
            />
            <figcaption>La page de connexion ne demande qu’une adresse email.</figcaption>
          </figure>
        </section>

        <section id="creer-projet">
          <h3>Créer un projet</h3>
          <p>Trois méthodes, regroupées dans le bloc « Créer un projet » de la home :</p>

          <h4>Vide (formulaire)</h4>
          <p>
            Vous démarrez avec une racine et trois vocabulaires par défaut très minimalistes (1
            audience, 3 échéances, 3 types de page). C’est à vous de remplir l’arborescence à partir
            d’une page blanche.
          </p>
          <p>
            <strong>Champs</strong> : nom (jusqu’à 100 caractères), slug technique (regex
            <code>[a-z0-9-]</code>, 50 max — auto-généré depuis le nom à la perte de focus),
            description (max 500 caractères, optionnel).
          </p>

          <h4>
            Via IA (Albert / DINUM)
            <span v-if="!cadrageStatus.enabled" class="help-badge"
              >indisponible sur cette instance</span
            >
          </h4>
          <p v-if="cadrageStatus.enabled">
            Albert
            <span v-if="cadrageStatus.model"
              >(modèle <code>{{ cadrageStatus.model }}</code
              >)</span
            >
            analyse <strong>un ou plusieurs documents</strong> que vous lui fournissez (PDF, DOCX,
            CSV, TXT, MD — jusqu’à {{ cadrageStatus.maxFiles ?? 5 }} fichiers,
            {{ cadrageStatus.maxFileMiB ?? 10 }} MiB chacun) et propose une première arborescence +
            roadmap + catalogues + structure Drupal, dans le format de bundle directement
            importable.
          </p>
          <p v-else>
            Cette fonction est activée par flag (<code>CADRAGE_ENABLED=1</code>) côté serveur et
            requiert une clé API Albert. Sur cette instance elle est désactivée.
          </p>

          <p v-if="cadrageStatus.enabled">Workflow :</p>
          <ol v-if="cadrageStatus.enabled">
            <li>Cliquer sur la card « Via IA » de la home → la modal s’ouvre.</li>
            <li>
              Glisser un ou plusieurs documents source + optionnellement quelques consignes (« cible
              : agents des collectivités », « scope strict aux aides ANAH »…).
            </li>
            <li>
              Albert répond en 10-60 secondes. Le bundle proposé est affiché avec un aperçu (nom,
              slug, nombre de rubriques, mesures, dispositifs…).
            </li>
            <li>
              Si le résultat n’est pas parfait, utiliser le champ <strong>Affiner</strong> en bas :
              décrire en français ce qu’il faut changer (« renomme l’axe 1 », « ajoute un dispositif
              »). Albert renvoie une nouvelle version, garde le reste intact. Itérez autant que
              nécessaire.
            </li>
            <li>
              Cliquer sur <strong>Importer ce projet</strong> : le projet est créé, vous êtes
              redirigé sur son arborescence.
            </li>
          </ol>

          <figure v-if="cadrageStatus.enabled">
            <img
              :src="`/help/cadrage-modal.png`"
              alt="Modal de cadrage IA en cours de génération"
              @error="onImgError"
            />
            <figcaption>Modal Albert : upload de documents, résultat, champ d’affinage.</figcaption>
          </figure>

          <h4>Depuis un bundle</h4>
          <p>
            Importez un fichier JSON exporté d’un autre atelier, ou produit par une IA via le
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
            Le serveur normalise les divergences de format à l’import (cf.
            <a
              href="https://github.com/bmatge/latelier-cadrage-site/blob/main/docs/bundle-format.md#champs-legacy-à-éviter"
              target="_blank"
              rel="noopener"
              >champs legacy</a
            >) : <code>audience</code> singulier devient <code>audiences[]</code>, les listes
            d’objets <code>[{key,label}]</code> redeviennent des strings là où c’est attendu, etc.
            Vous pouvez donc importer en toute confiance un bundle ancien ou produit par un LLM
            imparfait.
          </p>
        </section>

        <section id="editer-projet">
          <h3>Les 9 onglets d’un projet</h3>
          <p>
            Une fois dans un projet, la barre de navigation expose 9 onglets. Chaque onglet a sa
            rubrique de gestion détaillée plus bas dans ce guide :
          </p>
          <ul>
            <li>
              <strong>Objectifs</strong> — pyramide stratégique axes / objectifs / moyens. Voir
              <a href="#objectifs">rubrique 2</a>.
            </li>
            <li>
              <strong>Arborescence</strong> — l’arbre des pages du futur site, éditable en
              drag-drop, avec panneau détail à 7 sections. Voir
              <a href="#arborescence">rubrique 3</a>.
            </li>
            <li>
              <strong>Maquette</strong> — édition inline du rendu DSFR de chaque page, 17 schémas de
              paragraphes. Voir <a href="#maquette">rubrique 4</a>.
            </li>
            <li>
              <strong>Roadmap</strong> — grille croisant deux axes configurables. Voir
              <a href="#roadmap">rubrique 5</a>.
            </li>
            <li>
              <strong>Ressources & services</strong> — catalogue master-détail des dispositifs
              tiers. Voir <a href="#ressources">rubrique 6</a>.
            </li>
            <li>
              <strong>Modèle de données</strong> — vocabulaires projet + structure CMS Drupal. Voir
              <a href="#modele">rubrique 7</a>.
            </li>
            <li>
              <strong>Politiques publiques</strong> — kanban des mesures du plan. Voir
              <a href="#politiques">rubrique 8</a>.
            </li>
            <li>
              <strong>Parcours utilisateur</strong> — user stories et leur enchaînement d’écrans.
              Voir <a href="#parcours">rubrique 9</a>.
            </li>
            <li>
              <strong>Historique</strong> — révisions du tree (chaque PUT crée une révision), avec
              diff visuel et revert. Couvert dans <a href="#collaborer">Collaborer</a>.
            </li>
          </ul>
        </section>

        <section id="collaborer">
          <h3>Collaborer à plusieurs</h3>
          <h4>Public / privé</h4>
          <p>
            Chaque projet porte un flag <code>is_public</code>. Si <code>true</code>, toutes les
            routes <code>GET</code> (consultation) sont ouvertes aux visiteurs
            <em>non authentifiés</em>. Les écritures restent strictement protégées.
          </p>
          <p>Toggle via PATCH côté API ou via le menu admin du projet.</p>

          <h4>Bac à sable anonyme</h4>
          <p>
            Un visiteur non identifié peut <strong>tester des modifications localement</strong>
            (IndexedDB du navigateur) sans toucher au serveur. Modal implicite à la première
            tentative d’édition. Bouton « Exporter mon brouillon » qui produit un bundle JSON
            ré-importable par un admin.
          </p>

          <h4>Commentaires</h4>
          <p>
            Sur chaque nœud de l’arbre, un fil de commentaires (panneau détail). Permet de tracer
            les questions / décisions en parallèle de l’édition.
          </p>

          <h4>Historique et révisions</h4>
          <p>
            Toutes les modifications du tree créent une nouvelle révision. L’onglet
            <strong>Historique</strong> du projet montre l’auteur, le message, la date, et permet de
            revenir en arrière vers n’importe quelle version antérieure. Diff visuel ajouts /
            suppressions / modifications côté UI.
          </p>
        </section>

        <section id="exporter">
          <h3>Exporter et réimporter</h3>
          <p>
            Depuis la home, bouton <strong>Exporter</strong> à côté de chaque projet :
            téléchargement d’un fichier <code>bundle-{slug}-{date}.json</code>. Format documenté
            dans
            <a
              href="https://github.com/bmatge/latelier-cadrage-site/blob/main/docs/bundle-format.md"
              target="_blank"
              rel="noopener"
              >docs/bundle-format.md</a
            >.
          </p>
          <p>
            Le bundle contient tout l’état courant : projet (slug, nom, description), arbre,
            roadmap, 5 catalogues (vocab, dispositifs, mesures, objectifs, drupal_structure).
            <em>Pas</em> l’historique des révisions, <em>pas</em> les commentaires.
          </p>
          <p>
            Vous pouvez le réimporter via la card « Depuis un bundle » de la home. Utile pour :
            dupliquer un projet comme template, sauvegarder une version, partager un cadrage avec un
            collègue qui n’a pas accès à cette instance.
          </p>
        </section>

        <section id="roles">
          <h3>Rôles et permissions</h3>
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
                <td>
                  Page /admin, attribution de rôles, suppression de projets d’autrui, audit log
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            Le self-signup donne <code>viewer</code> global. Un premier admin est créé via
            <code>BOOTSTRAP_ADMIN_EMAILS</code> au démarrage du serveur, puis les rôles se gèrent
            via la page <code>/admin</code>.
          </p>
        </section>

        <section id="personnaliser">
          <h3>Vocabulaires projet (survol)</h3>
          <p>
            Chaque projet définit son propre vocabulaire (audiences, échéances, types de page) dans
            l’onglet <strong>Modèle de données</strong>. Modifier ici met à jour les chips affichés
            partout dans le projet (arborescence, roadmap, mesures, maquette).
          </p>
          <p>
            La gestion détaillée (ajout, renommage, déplacement, clés auto-générées) est dans la
            <a href="#modele">rubrique 7 — Modèle de données</a>.
          </p>
        </section>

        <section id="faq">
          <h3>FAQ</h3>
          <details>
            <summary>
              Mon import IA renvoie « bundle généré, non conforme au schéma » — je peux quand même
              importer ?
            </summary>
            <p>
              Oui. L’app est volontairement tolérante à l’import : les erreurs ajv sont des
              <em>recommandations</em>, pas des blocages. Le serveur normalise les divergences
              connues (audiences, options, categories). Importez puis ajustez si quelque chose ne
              s’affiche pas bien.
            </p>
          </details>
          <details>
            <summary>
              Comment partager un projet à un collègue qui n’est pas sur cette instance ?
            </summary>
            <p>
              Exportez le bundle (bouton « Exporter » sur la home), envoyez-lui le fichier
              <code>.json</code>, il l’importe via la card « Depuis un bundle ».
            </p>
          </details>
          <details>
            <summary>Comment basculer un projet en privé ?</summary>
            <p>
              Depuis le projet, badge « Public » → cliquer pour passer en privé (permission
              <code>project:update</code> requise). Les visiteurs anonymes n’auront plus accès aux
              routes <code>GET</code> du projet.
            </p>
          </details>
          <details>
            <summary>J’ai supprimé un projet par erreur, comment le récupérer ?</summary>
            <p>
              Si vous l’aviez exporté avant : réimporter le bundle. Sinon, demander à un admin de
              restaurer depuis le backup SQLite (rétention 30 j en prod, cf.
              <code>docs/ops/restore.md</code>).
            </p>
          </details>
          <details>
            <summary>
              Albert produit des champs qui n’existent pas dans le schéma — qu’est-ce qui se passe ?
            </summary>
            <p>
              Les champs inconnus du schéma sont silencieusement ignorés à l’import. Les 5 clés
              <code>data.*</code> autorisées sont : <code>vocab</code>, <code>dispositifs</code>,
              <code>mesures</code>, <code>objectifs</code>, <code>drupal_structure</code>. Tout le
              reste sous <code>data.*</code> est jeté.
            </p>
          </details>
          <details>
            <summary>Combien d’utilisateurs simultanés sur un même projet ?</summary>
            <p>
              Pas de limite stricte. Optimistic locking sur le tree et la roadmap (header
              <code>If-Match: revision_id</code>) : si quelqu’un sauve en même temps que vous, vous
              recevez un 409 conflict et devez recharger.
            </p>
          </details>
        </section>
      </section>

      <!-- ============================================================ -->
      <!-- 2 · OBJECTIFS                                                 -->
      <!-- ============================================================ -->
      <section id="objectifs" class="help-section-l1">
        <h2>2 · Objectifs</h2>
        <p>
          L’onglet <strong>Objectifs</strong> modélise la stratégie du site sous forme d’une
          pyramide à 3 niveaux. Chaque <em>moyen</em> peut être rattaché à un ou plusieurs nœuds de
          l’arborescence — c’est ce qui donne la couverture stratégique du site (« quelle page sert
          quel objectif »).
        </p>

        <figure>
          <img
            :src="`/help/objectifs.png`"
            alt="Page Objectifs avec la pyramide axes / objectifs / moyens"
            @error="onImgError"
          />
          <figcaption>
            Pyramide stratégique : axes, objectifs, moyens. Le compteur en haut indique combien de
            moyens sont rattachés à un nœud de l’arbre.
          </figcaption>
        </figure>

        <section id="objectifs-pyramide">
          <h3>La pyramide à 3 niveaux</h3>
          <ul>
            <li>
              <strong>Axes</strong> — orientation générale (ex. « Simplifier l’accès aux aides »).
              Chaque axe porte un libellé et une description optionnelle.
            </li>
            <li>
              <strong>Objectifs</strong> — résultats visés à l’intérieur d’un axe (ex. « Réduire le
              délai de demande de 3 mois à 1 mois »).
            </li>
            <li>
              <strong>Moyens</strong> — actions concrètes pour atteindre l’objectif (ex. « Créer un
              simulateur unique en page d’accueil »). Un moyen pointe vers zéro ou plusieurs
              <em>nœuds</em> de l’arbre.
            </li>
          </ul>
          <p>
            En haut de la page, un compteur indique «
            <strong>X / Y moyens couverts par un nœud</strong> » : c’est l’indicateur clé de réalité
            opérationnelle de votre stratégie. Plus le ratio est faible, plus l’arbre manque de
            pages pour porter les objectifs.
          </p>
        </section>

        <section id="objectifs-crud">
          <h3>Créer, renommer, déplacer, supprimer</h3>
          <ul>
            <li>
              <strong>Ajouter un axe</strong> via le bouton « <code>+ Ajouter un axe</code> » en
              haut. Le titre se saisit immédiatement.
            </li>
            <li>
              <strong>Renommer</strong> n’importe quel élément (axe, objectif, moyen) : cliquer sur
              son libellé → input. <kbd>Enter</kbd> valide, <kbd>Échap</kbd> annule.
            </li>
            <li>
              <strong>Décrire un axe</strong> : cliquer sur « Ajouter une description » sous le
              titre.
            </li>
            <li>
              <strong>Réordonner les axes</strong> via les boutons <code>↑</code> / <code>↓</code>.
            </li>
            <li>
              <strong>Ajouter un objectif</strong> dans un axe via « <code>+ Objectif</code> » à la
              fin de la liste des objectifs de cet axe.
            </li>
            <li>
              <strong>Ajouter un moyen</strong> dans un objectif via « <code>+ Moyen</code> ».
            </li>
            <li>
              <strong>Supprimer</strong> : bouton <code>×</code> sur moyens et objectifs. Pour les
              axes, modal de confirmation qui rappelle le nombre d’objectifs et de moyens qui seront
              supprimés en cascade.
            </li>
          </ul>
          <figure>
            <img
              :src="`/help/inline-edit.png`"
              alt="Champ texte en mode édition inline"
              @error="onImgError"
            />
            <figcaption>
              Édition inline : cliquer sur n’importe quel libellé ouvre un input directement à sa
              place. <kbd>Enter</kbd> valide, <kbd>Échap</kbd> annule.
            </figcaption>
          </figure>
        </section>

        <section id="objectifs-liens">
          <h3>Lier les moyens aux nœuds</h3>
          <p>
            Sur chaque moyen, un champ permet d’ajouter des <strong>ID de nœud</strong> de
            l’arborescence. La saisie ouvre une liste d’autocomplétion qui suggère les nœuds
            existants (libellé + breadcrumb en tooltip). Les nœuds liés s’affichent en chips
            <code>L0</code>, <code>L1</code>… avec le breadcrumb au survol. Bouton <code>×</code>
            sur chaque chip pour délier.
          </p>
          <p>
            Ces liens sont <strong>bidirectionnels</strong> : le panneau détail d’un nœud (rubrique
            3) liste réciproquement les moyens / objectifs qu’il porte.
          </p>
        </section>

        <section id="objectifs-import">
          <h3>Import / export / reset</h3>
          <ul>
            <li>
              <strong>Export</strong> : bouton « Export » en haut → télécharge la pyramide complète
              en JSON. Pratique pour archiver une version, ou la coller dans un autre projet.
            </li>
            <li>
              <strong>Import</strong> : bouton « Import » → sélection d’un fichier JSON. Modal de
              confirmation avant d’écraser la pyramide actuelle.
            </li>
            <li>
              <strong>Vider la pyramide</strong> : bouton « Reset » → action irréversible
              (confirmation modale, mention explicite). Utile pour repartir d’une page blanche.
            </li>
          </ul>
          <p>
            Filtre <strong>recherche textuelle</strong> en haut : tape sur axes, objectifs et moyens
            en temps réel. Pratique sur les gros projets pour retrouver un moyen par mot-clé.
          </p>
        </section>
      </section>

      <!-- ============================================================ -->
      <!-- 3 · ARBORESCENCE                                              -->
      <!-- ============================================================ -->
      <section id="arborescence" class="help-section-l1">
        <h2>3 · Arborescence</h2>
        <p>
          L’<strong>arborescence</strong> est le cœur du projet : l’arbre des pages du futur site.
          Édition en drag-drop côté gauche, panneau détail à 7 sections côté droit. Toute
          modification crée automatiquement une nouvelle révision (cf.
          <a href="#arbo-historique">Sauvegarde et conflits</a>).
        </p>

        <figure>
          <img
            :src="`/help/tree.png`"
            alt="Page Arborescence avec panneau détail"
            @error="onImgError"
          />
          <figcaption>Arborescence : drag-drop côté gauche, panneau détail côté droit.</figcaption>
        </figure>

        <section id="arbo-navigation">
          <h3>Naviguer dans l’arbre</h3>
          <ul>
            <li>
              <strong>Cliquer un nœud</strong> → il est sélectionné, son détail s’ouvre dans le
              panneau droit.
            </li>
            <li>
              <strong>Replier / déreplier</strong> une branche : flèche à gauche du nœud. Utile sur
              les gros projets pour limiter le bruit visuel.
            </li>
            <li>
              <strong>Filtrer par recherche</strong> textuelle : tape sur le libellé et le TL;DR de
              chaque nœud.
            </li>
            <li>
              <strong>Filtrer par échéance</strong> : sélecteur « toutes / sans échéance / [chaque
              échéance du projet] ».
            </li>
            <li>
              <strong>Compteur</strong> en bas : « X nœuds · profondeur Y » donne la taille globale
              du projet.
            </li>
          </ul>
        </section>

        <section id="arbo-crud">
          <h3>Créer, déplacer, supprimer</h3>
          <ul>
            <li>
              <strong>Nouvelle rubrique</strong> : bouton « <code>+ Nouvelle rubrique</code> » →
              crée un enfant du nœud sélectionné. Si aucun nœud n’est sélectionné, l’ajoute à la
              racine.
            </li>
            <li><strong>Renommer</strong> : cliquer sur le libellé du nœud → input inline.</li>
            <li>
              <strong>Éditer le TL;DR</strong> (descriptif court) du nœud : cliquer sur la zone
              TL;DR du panneau détail.
            </li>
            <li>
              <strong>Drag-and-drop</strong> : glisser un nœud avant / après un autre, ou
              <em>dessus</em> pour en faire un enfant. Réorganisation profonde possible.
            </li>
            <li>
              <strong>Promouvoir / démouvrir</strong> : boutons dédiés dans le panneau détail (ou
              barre d’outils du nœud) pour changer le niveau hiérarchique d’un cran.
            </li>
            <li>
              <strong>Déplacer parmi les frères</strong> : boutons <code>↑</code> / <code>↓</code>
              dans la barre d’outils du nœud.
            </li>
            <li>
              <strong>Supprimer</strong> : bouton <code>×</code> → modal de confirmation qui
              rappelle le nombre de sous-nœuds qui seront supprimés en cascade.
            </li>
          </ul>
          <figure>
            <img
              :src="`/help/confirm-modal.png`"
              alt="Modal de confirmation de suppression"
              @error="onImgError"
            />
            <figcaption>
              Toute suppression non triviale (axe, nœud avec enfants, mesure couverte…) passe par
              une modal de confirmation qui détaille les effets en cascade.
            </figcaption>
          </figure>
        </section>

        <section id="arbo-detail">
          <h3>Le panneau détail (7 sections)</h3>
          <p>Le panneau de droite expose, pour le nœud sélectionné, 7 sections repliables :</p>
          <ol>
            <li>
              <strong>Configuration</strong> — libellé, TL;DR, publics cibles (multi-select), types
              de page (multi-select), échéance unique.
            </li>
            <li>
              <strong>Blocs éditoriaux</strong> — composants prévus pour cette page (édition
              ailleurs : la Maquette, cf. <a href="#maquette">rubrique 4</a>).
            </li>
            <li>
              <strong>Améliorations</strong> — items de roadmap rattachés à ce nœud : titre,
              description, deadline. Ajout / édition / suppression inline.
            </li>
            <li>
              <strong>Politiques publiques</strong> — multi-select des mesures portées par ce nœud.
              Choix dans le catalogue (rubrique 8).
            </li>
            <li>
              <strong>Ressources & services</strong> — multi-select des dispositifs tiers que ce
              nœud pointe / intègre.
            </li>
            <li>
              <strong>Objectifs liés</strong> — multi-select des moyens stratégiques portés par ce
              nœud (lecture inverse de la rubrique 2).
            </li>
            <li><strong>Commentaires</strong> — fil de commentaires daté.</li>
          </ol>
          <p>
            Un raccourci « <strong>↗ Voir dans la maquette</strong> » saute directement à l’éditeur
            DSFR de la même page (cf. <a href="#maquette">rubrique 4</a>).
          </p>
        </section>

        <section id="arbo-liens">
          <h3>Liens vers les catalogues</h3>
          <p>
            Les chips de <strong>publics cibles</strong> et <strong>types de page</strong> du nœud
            puisent dans les vocabulaires <em>du projet</em> (cf. <a href="#modele-vocab">7.1</a>) :
            si vous renommez « Particuliers » → « Grand public » dans le modèle, le chip est mis à
            jour partout dans l’arbre.
          </p>
          <p>
            Idem pour les mesures, dispositifs et objectifs : ce sont des références au catalogue du
            projet (rubriques 6, 8, 2). La <strong>suppression d’une entrée de catalogue</strong>
            laisse une référence orpheline sur les nœuds — c’est volontaire, pour ne pas perdre
            d’information silencieusement.
          </p>
          <figure>
            <img
              :src="`/help/multi-select.png`"
              alt="MultiSelect dropdown ouvert avec options cochées"
              @error="onImgError"
            />
            <figcaption>
              MultiSelect des catalogues (mesures, dispositifs, objectifs) : recherche, cases à
              cocher, tag « N options sélectionnées » sur le trigger.
            </figcaption>
          </figure>
        </section>

        <section id="arbo-historique">
          <h3>Sauvegarde et conflits</h3>
          <p>
            Un indicateur en haut de la page reflète l’état de sauvegarde : <em>sauvegardé</em>,
            <em>modifications non sauvegardées</em>, <em>sauvegarde en cours</em>, ou
            <em>conflit</em>.
          </p>
          <p>
            <strong>Conflit (HTTP 409)</strong> : si un autre utilisateur a sauvegardé l’arbre
            pendant que vous éditiez, le serveur refuse votre PUT (optimistic locking via
            <code>If-Match: revision_id</code>). L’UI vous propose de <strong>recharger</strong>
            pour repartir de la dernière version. Vos modifications locales sont perdues — pensez à
            les noter avant.
          </p>
          <p>
            <strong>Bac à sable anonyme</strong> : si vous n’êtes pas authentifié, les modifications
            sont sauvegardées dans l’IndexedDB du navigateur (cf.
            <a href="#collaborer">section Collaborer</a>). Le bouton « Exporter mon brouillon »
            permet de produire un bundle JSON pour transmission à un admin.
          </p>
          <p>
            <strong>Historique</strong> : chaque sauvegarde crée une révision. L’onglet
            <code>/historique</code> du projet liste l’auteur, le message, la date, et permet de
            revert sur n’importe quelle version. Diff visuel ajouts / suppressions / modifications.
          </p>
        </section>
      </section>

      <!-- ============================================================ -->
      <!-- 4 · MAQUETTE                                                  -->
      <!-- ============================================================ -->
      <section id="maquette" class="help-section-l1">
        <h2>4 · Maquette</h2>
        <p>
          La <strong>Maquette</strong> est l’éditeur visuel des pages du futur site, en rendu DSFR.
          Chaque page (nœud de l’arbre) est composée de <em>paragraphes</em> (= composants DSFR :
          accordion, tabs, cards-row, callout, image-text…). Édition
          <strong>inline directement dans le rendu</strong> : on voit ce qu’on édite.
        </p>

        <figure>
          <img
            :src="`/help/maquette.png`"
            alt="Page Maquette avec liste nœuds, éditeur central et propriétés CMS"
            @error="onImgError"
          />
          <figcaption>
            Maquette interactive : panneau gauche (nœuds), édition centrale avec rendu DSFR, panneau
            droit pour les propriétés CMS du nœud.
          </figcaption>
        </figure>

        <section id="maquette-navigation">
          <h3>Onglets et panneaux</h3>
          <ul>
            <li>
              <strong>Onglets en haut</strong> : Accueil + un onglet par enfant de la racine («
              Particuliers », « Pros », « Partenaires »…). Sélectionne la sous-arborescence visible
              dans le panneau gauche.
            </li>
            <li>
              <strong>Panneau gauche</strong> : liste de nœuds de l’onglet courant. Badge avec le
              nombre de paragraphes par page. Cliquer = sélectionner.
            </li>
            <li>
              <strong>Breadcrumb cliquable</strong> en haut : permet de remonter dans la hiérarchie
              sans passer par l’onglet.
            </li>
            <li>
              <strong>Panneau droit</strong> : propriétés CMS du nœud (cf.
              <a href="#maquette-proprietes">4.4</a>).
            </li>
            <li>
              <strong>Toggles</strong> : boutons pour masquer panneau gauche, panneau droit, ou les
              deux (mode <em>plein écran preview</em>).
            </li>
          </ul>
        </section>

        <section id="maquette-paragraphes">
          <h3>Paragraphes DSFR</h3>
          <p>
            17 schémas couverts par <code>shared/src/dsfr-paragraphs.ts</code> : accordion, tabs,
            cards-row, callout, image-text, héros, quote, video, file-download, list-check, etc. La
            liste exacte est documentée côté code — pour ajouter un schéma, voir l’ADR-009.
          </p>
          <ul>
            <li>
              <strong>Ajouter un paragraphe</strong> : sélecteur de type en haut de la zone preview
              → bouton « <code>+ Ajouter un paragraphe</code> ».
            </li>
            <li>
              <strong>Déplacer</strong> un paragraphe : boutons <code>↑</code> / <code>↓</code>
              dans la mini-toolbar qui apparaît au survol du paragraphe.
            </li>
            <li>
              <strong>Réinitialiser</strong> à ses valeurs par défaut : bouton <code>↺</code>.
            </li>
            <li><strong>Supprimer</strong> : bouton <code>×</code>.</li>
            <li>
              <strong>Items internes</strong> (cartes d’une <code>cards-row</code>, onglets d’un
              <code>tabs</code>…) : ajout / déplacement / suppression au sein du paragraphe via la
              même mini-toolbar contextuelle.
            </li>
          </ul>
        </section>

        <section id="maquette-edition">
          <h3>Édition inline</h3>
          <p>
            <strong>Cliquer un champ texte du rendu = passer en édition.</strong> Le titre d’une
            carte, la description, le lien d’un bouton, le label d’un onglet — tout est éditable sur
            place via le composant <code>InlineEdit</code>.
          </p>
          <ul>
            <li><kbd>Enter</kbd> valide.</li>
            <li><kbd>Échap</kbd> annule.</li>
            <li>
              Sur un champ multi-ligne (description, blockquote), <kbd>Shift+Enter</kbd> insère un
              saut de ligne ; <kbd>Enter</kbd> seul valide.
            </li>
          </ul>
          <p>
            En <strong>lecture seule</strong> (utilisateur viewer ou non authentifié sur projet
            privé) les champs ne sont pas cliquables — la maquette se consulte sans risque.
          </p>
        </section>

        <section id="maquette-proprietes">
          <h3>Propriétés CMS du nœud</h3>
          <p>
            Le panneau droit expose les <strong>propriétés Drupal</strong> du nœud, alimentées par
            la structure CMS du projet (cf. <a href="#modele-cms">7.2</a>) :
          </p>
          <ul>
            <li>
              <strong>Type de contenu</strong> : sélection unique parmi les types définis dans le
              modèle de données.
            </li>
            <li>
              <strong>Taxonomies</strong> : pour chaque taxonomie configurée (publics, thèmes,
              mesures, etc.), un select ou multi-select selon le mode « multi » de la taxonomie. Le
              libellé et les options viennent du modèle de données — taper ici met à jour ce qui
              sortira à l’export Drupal final.
            </li>
            <li>
              <strong>Améliorations du nœud</strong> : section repliable identique à celle du
              panneau détail de l’arborescence — pratique pour ne pas changer d’onglet.
            </li>
            <li>
              <strong>Sous-pages</strong> : cartes cliquables pour naviguer vers les enfants du
              nœud, sans repasser par le panneau gauche.
            </li>
          </ul>
          <p>
            Raccourci « <strong>↗ éditer le nœud</strong> » en haut du panneau pour sauter dans
            l’arborescence (rubrique 3) sur le même nœud.
          </p>
        </section>

        <section id="maquette-import">
          <h3>Import / export de la maquette</h3>
          <ul>
            <li>
              <strong>Exporter toute la maquette</strong> : bouton
              <code>⬇ Exporter toute la maquette</code> → fichier JSON avec
              <code>{ version, maquettes: { nodeId: { paragraphs, taxonomy } } }</code> couvrant
              toutes les pages du projet.
            </li>
            <li>
              <strong>Importer</strong> : sélection d’un fichier JSON → l’app détecte les conflits
              (nœuds déjà maquettés) et demande confirmation avant d’écraser.
            </li>
          </ul>
          <p>
            Note : la maquette d’un projet voyage <em>aussi</em> dans le bundle global du projet
            (cf. <a href="#exporter">Exporter / réimporter</a>). L’export maquette dédié est utile
            pour copier la maquette seule d’un projet à l’autre.
          </p>
        </section>
      </section>

      <!-- ============================================================ -->
      <!-- 5 · ROADMAP                                                   -->
      <!-- ============================================================ -->
      <section id="roadmap" class="help-section-l1">
        <h2>5 · Roadmap</h2>
        <p>
          La <strong>Roadmap</strong> est une grille (type kanban) qui croise deux dimensions
          configurables, choisies parmi : <em>Types de page</em>, <em>Publics cibles</em>,
          <em>Échéances</em>. C’est le tableau de bord temporel et fonctionnel du projet.
        </p>

        <figure>
          <img
            :src="`/help/roadmap.png`"
            alt="Page Roadmap en grille kanban croisant types de page et échéances"
            @error="onImgError"
          />
          <figcaption>
            Roadmap kanban : axes X / Y configurables. Cartes blanches = nœuds, cartes jaunes =
            améliorations rattachées.
          </figcaption>
        </figure>

        <section id="roadmap-axes">
          <h3>Axes X et Y configurables</h3>
          <p>
            En haut de la page, deux sélecteurs choisissent les dimensions des
            <strong>lignes</strong> et des <strong>colonnes</strong>. Les trois options disponibles
            :
          </p>
          <ul>
            <li><strong>Types de page</strong> (hub, éditorial, service, simulator…)</li>
            <li><strong>Publics cibles</strong> (particuliers, pros, collectivités…)</li>
            <li><strong>Échéances</strong> (juin 2026, septembre 2026, déc 2026, 2027+, sans)</li>
          </ul>
          <p>
            Les deux axes ne peuvent pas être identiques : si vous choisissez la même dimension des
            deux côtés, l’app <strong>swap automatiquement</strong> avec la précédente sélection
            pour garder une grille cohérente.
          </p>
          <p>
            Compteurs : chaque ligne, chaque colonne, et chaque cellule affichent le nombre de
            cartes — utile pour repérer les zones vides ou sur-chargées.
          </p>
        </section>

        <section id="roadmap-cartes">
          <h3>Cartes nœuds et améliorations</h3>
          <p>Deux types de cartes coexistent dans la grille :</p>
          <ul>
            <li>
              <strong>Cartes blanches</strong> = nœuds de l’arbre. Cliquer la carte → lien
              <code>↗</code> vers le nœud dans l’<a href="#arborescence">arborescence</a>.
            </li>
            <li>
              <strong>Cartes jaunes</strong> = améliorations futures rattachées à un nœud. Titre et
              description éditables <em>inline</em> directement depuis la carte (textarea pour la
              description). Pratique pour ajuster une roadmap sans changer de page.
            </li>
          </ul>
          <p>
            Statut <strong>« couvert »</strong> / <strong>« non couvert »</strong> affiché sur les
            cartes pertinentes : indique si le nœud porte au moins une mesure / un moyen / une
            ressource (selon le contexte). Un nœud non couvert est généralement un risque à
            adresser.
          </p>
          <p>
            <strong>Recherche</strong> en haut : filtre temps-réel sur le libellé du nœud ou le
            titre de l’amélioration.
          </p>
        </section>

        <section id="roadmap-dnd">
          <h3>Drag-and-drop d’échéance</h3>
          <p>
            Quand l’axe X (colonnes) est défini sur <strong>Échéances</strong>, vous pouvez
            <strong>glisser une carte nœud d’une colonne à une autre</strong> pour changer
            directement la deadline du nœud. Effet équivalent à modifier l’échéance dans le panneau
            détail de l’arborescence — l’avantage est de voir le contexte global pendant qu’on
            ajuste.
          </p>
          <p>
            Sur les autres axes (publics ou types de page), le drag-drop est désactivé — ce sont des
            dimensions multi-valeurs ou non éditables visuellement.
          </p>
        </section>
      </section>

      <!-- ============================================================ -->
      <!-- 6 · RESSOURCES                                                -->
      <!-- ============================================================ -->
      <section id="ressources" class="help-section-l1">
        <h2>6 · Ressources & services (dispositifs)</h2>
        <p>
          Catalogue des <strong>outils, plateformes, simulateurs, services existants</strong>
          susceptibles d’être pointés ou intégrés depuis le futur site. Une fois saisis, ils peuvent
          être rattachés à des nœuds de l’arbre (cf.
          <a href="#arbo-detail">panneau détail 3.3</a>).
        </p>

        <figure>
          <img
            :src="`/help/ressources.png`"
            alt="Catalogue dispositifs en master-détail"
            @error="onImgError"
          />
          <figcaption>
            Master-détail : liste filtrable à gauche (catégorie, public), panneau de détail à droite
            avec tous les champs du dispositif sélectionné.
          </figcaption>
        </figure>

        <section id="ressources-catalogue">
          <h3>Catalogue master-détail</h3>
          <ul>
            <li>
              <strong>Liste à gauche</strong> : tous les dispositifs du projet. Cliquer → sélection.
            </li>
            <li>
              <strong>Panneau détail à droite</strong> : tous les champs du dispositif sélectionné,
              éditables inline.
            </li>
            <li>
              <strong>Nouveau dispositif</strong> : bouton « <code>+ Nouveau dispositif</code> » en
              haut → crée une entrée vide sélectionnée immédiatement pour saisie.
            </li>
            <li>
              <strong>Supprimer</strong> : bouton dédié dans le panneau détail (modal de
              confirmation).
            </li>
          </ul>
        </section>

        <section id="ressources-crud">
          <h3>Champs d’un dispositif</h3>
          <p>
            Tous les champs sont éditables via <code>InlineEdit</code> (cliquer → input,
            <kbd>Enter</kbd> valide) :
          </p>
          <ul>
            <li><strong>Nom</strong> — libellé d’affichage.</li>
            <li>
              <strong>Catégorie</strong> — libre, sert au regroupement et au filtre. Définir une
              taxonomie cohérente dans le projet (ex. « Logement », « Énergie », « Mobilité »).
            </li>
            <li>
              <strong>Publics ciblés</strong> — saisie au format CSV («
              <code>particuliers, pros</code> »). Affichés en chips colorés (mapping audience →
              couleur DSFR via le vocab projet).
            </li>
            <li><strong>Porteur</strong> — ministère ou organisme responsable du dispositif.</li>
            <li><strong>Tutelle</strong> — autorité de tutelle du porteur.</li>
            <li><strong>Type</strong> — Portail, Simulateur, Carte, Service en ligne…</li>
            <li>
              <strong>Maturité</strong> — Mature, Beta, Pilote, Expérimentation. Aide à pondérer le
              choix.
            </li>
            <li>
              <strong>URL</strong> — lien public du dispositif. Cliquable en lecture, modifiable en
              édition.
            </li>
            <li><strong>Téléphone</strong> de contact si pertinent.</li>
            <li><strong>Description longue</strong> — textarea, description publique.</li>
            <li>
              <strong>Réutilisabilité</strong> — modalités pour intégrer / réutiliser le dispositif
              (API, white-label, simple lien…).
            </li>
            <li>
              <strong>Commentaire interne</strong> — notes pour l’équipe projet, n’apparaît jamais
              dans l’export Drupal.
            </li>
          </ul>
        </section>

        <section id="ressources-filtres">
          <h3>Filtres et recherche</h3>
          <ul>
            <li>
              <strong>Recherche textuelle</strong> : tape sur nom, description, porteur, tutelle.
            </li>
            <li>
              <strong>Filtre catégorie</strong> : select pré-rempli avec les catégories détectées
              dans le catalogue.
            </li>
            <li>
              <strong>Filtre public</strong> : select pré-rempli avec les audiences détectées.
            </li>
          </ul>
          <p>
            Compteur en haut : « <strong>X / Y dispositifs affichés</strong> » — utile pour
            confirmer qu’un filtre n’en cache pas trop.
          </p>
        </section>

        <section id="ressources-import">
          <h3>Import / export / reset</h3>
          <ul>
            <li>
              <strong>Exporter</strong> le catalogue : bouton dédié → JSON complet. Pratique pour
              partager / réutiliser un catalogue entre projets.
            </li>
            <li>
              <strong>Importer</strong> un catalogue : sélection d’un fichier JSON.
              <em>Attention : remplacement total</em> du catalogue actuel (modal de confirmation).
            </li>
            <li>
              <strong>Reset</strong> : vider totalement le catalogue. Action irréversible avec
              confirmation.
            </li>
          </ul>
        </section>
      </section>

      <!-- ============================================================ -->
      <!-- 7 · MODÈLE DE DONNÉES                                         -->
      <!-- ============================================================ -->
      <section id="modele" class="help-section-l1">
        <h2>7 · Modèle de données</h2>
        <p>
          Cet onglet est la <strong>source de vérité</strong> des vocabulaires et de la structure
          CMS du projet. Tout ce qui apparaît en chip / select / badge dans les autres onglets est
          défini ici. Deux onglets internes :
        </p>

        <figure>
          <img
            :src="`/help/modele.png`"
            alt="Page Modèle de données, onglet Vocabulaires projet"
            @error="onImgError"
          />
          <figcaption>
            Vocabulaires projet : trois accordéons (Publics cibles, Échéances, Types de page),
            chaque entrée éditable avec libellé + clé technique immuable.
          </figcaption>
        </figure>

        <section id="modele-vocab">
          <h3>7.1 — Vocabulaires projet</h3>
          <p>Trois accordéons, repliables individuellement :</p>
          <ul>
            <li>
              <strong>Publics cibles</strong> (<code>audiences</code>) — ex.
              <code>particuliers</code>, <code>pros</code>, <code>collectivites</code>. Affichés en
              chips colorés partout dans le projet.
            </li>
            <li>
              <strong>Échéances</strong> (<code>deadlines</code>) — ex. <code>juin</code>,
              <code>septembre</code>, <code>y2027</code>. Servent au tri / filtre roadmap et nœuds.
            </li>
            <li>
              <strong>Types de page</strong> (<code>page_types</code>) — ex. <code>hub</code>,
              <code>editorial</code>, <code>service</code>, <code>simulator</code>. Affichés en
              badge sur chaque nœud.
            </li>
          </ul>
          <p>Pour chaque vocabulaire :</p>
          <ul>
            <li>
              <strong>Ajouter</strong> une entrée : input + bouton « <code>+ Ajouter</code> ».
            </li>
            <li>
              <strong>Renommer</strong> via l’input du libellé. La <strong>clé technique</strong>
              (slug auto-généré) reste immuable — c’est volontaire pour préserver les références
              dans le tree.
            </li>
            <li><strong>Réordonner</strong> via <code>↑</code> / <code>↓</code>.</li>
            <li>
              <strong>Supprimer</strong> via <code>×</code>. Les nœuds qui référençaient cette
              entrée gardent la référence orpheline (visible dans l’UI comme tag grisé).
            </li>
            <li>
              <strong>Aperçu de clé</strong> : pour les nouvelles entrées, la clé qui sera générée
              est affichée à côté de l’input pour anticiper les collisions.
            </li>
          </ul>
          <p class="help-callout">
            Toute modification ici se répercute <strong>immédiatement</strong> sur l’affichage de
            l’arborescence, de la roadmap, des mesures et de la maquette — sans recharger la page.
            Pattern documenté dans
            <a
              href="https://github.com/bmatge/latelier-cadrage-site/blob/main/docs/bundle-format.md"
              target="_blank"
              rel="noopener"
              >ADR-009</a
            >.
          </p>
        </section>

        <section id="modele-cms">
          <h3>7.2 — Structure CMS</h3>
          <p>Définit la modélisation Drupal qui sera utilisée à l’export. Trois accordéons :</p>
          <ul>
            <li>
              <strong>Types de contenu</strong> — la liste des content types Drupal (ex.
              <code>article</code>, <code>page</code>, <code>landing</code>). Ajout / renommage /
              suppression via inputs.
            </li>
            <li>
              <strong>Composants</strong> (paragraphes Drupal activés) — clé technique +
              <em>libellé optionnel</em> affiché dans l’UI maquette. Permet de filtrer la liste des
              paragraphes disponibles dans l’éditeur (rubrique 4).
            </li>
            <li>
              <strong>Taxonomies</strong> — pour chaque taxonomie :
              <ul>
                <li>Libellé éditable.</li>
                <li>
                  Toggle <strong>« multi »</strong> : si activé, plusieurs valeurs simultanément
                  sélectionnables sur un nœud (multi-select) ; sinon, valeur unique (select).
                </li>
                <li>Liste d’options : ajout / renommage / suppression.</li>
              </ul>
              Le panneau <strong>Propriétés CMS</strong> de la Maquette (cf.
              <a href="#maquette-proprietes">4.4</a>) consomme dynamiquement ces taxonomies.
            </li>
          </ul>
          <p>
            <strong>Reset structure CMS</strong> : bouton dédié → réinitialise à la structure par
            défaut (DSFR + types Drupal communs). Confirmation modale.
          </p>
        </section>
      </section>

      <!-- ============================================================ -->
      <!-- 8 · POLITIQUES                                                -->
      <!-- ============================================================ -->
      <section id="politiques" class="help-section-l1">
        <h2>8 · Politiques publiques (mesures)</h2>
        <p>
          Cet onglet liste les <strong>mesures</strong> du plan ministériel / de la stratégie
          publique sur laquelle s’aligne le site. Présentation kanban avec deux dimensions fixes
          (axe × échéance). Chaque mesure peut ensuite être <em>portée</em> par un ou plusieurs
          nœuds (cf. <a href="#arbo-detail">3.3</a>) — c’est ce qui donne l’indicateur de
          couverture.
        </p>

        <figure>
          <img
            :src="`/help/politiques.png`"
            alt="Kanban des mesures politiques"
            @error="onImgError"
          />
          <figcaption>
            Kanban : axes en lignes, échéances en colonnes. Chaque carte est une mesure ; le badge «
            ✓ couvert » indique qu’au moins un nœud la porte.
          </figcaption>
        </figure>

        <section id="politiques-kanban">
          <h3>Kanban axes × échéances</h3>
          <p>Grille où :</p>
          <ul>
            <li>
              <strong>Lignes</strong> = axes stratégiques du plan (ex. « Aides logement », «
              Mobilité quotidienne »).
            </li>
            <li>
              <strong>Colonnes</strong> = échéances du projet (juin 2026, septembre 2026, déc 2026,
              2027+). Couleurs spécifiques par échéance pour reconnaître la temporalité au coup
              d’œil.
            </li>
          </ul>
          <p>Filtres en haut :</p>
          <ul>
            <li><strong>Axe</strong> — réduire à un axe précis (ou voir tous).</li>
            <li><strong>Public</strong> — filtre par public cible.</li>
            <li>
              <strong>Recherche</strong> textuelle — sur ID, titre, label, résumé, description.
            </li>
          </ul>
          <p>
            Compteurs par colonne + compteurs globaux en bas : « X / Y mesures affichées · Z portées
            par un nœud ».
          </p>
        </section>

        <section id="politiques-crud">
          <h3>Créer, éditer, supprimer</h3>
          <ul>
            <li>
              <strong>Ajouter</strong> une mesure : bouton « <code>+ Mesure</code> » dans la cellule
              ciblée (axe × échéance). La mesure naît avec l’axe et l’échéance pré-remplis.
            </li>
            <li>
              <strong>Éditer en mode replié</strong> : libellé (label) éditable inline directement
              sur la carte.
            </li>
            <li>
              <strong>Éditer en mode déplié</strong> : bouton <code>✎</code> sur la carte → affiche
              tous les champs (résumé, description longue, axe / échéance via select, publics cibles
              via tags cliquables). Bouton <code>▴</code> pour replier.
            </li>
            <li>
              <strong>Déplacer</strong> : drag-and-drop d’une mesure vers une autre cellule → change
              simultanément l’axe et l’échéance.
            </li>
            <li>
              <strong>Supprimer</strong> : bouton <code>×</code> sur la carte (modal de
              confirmation).
            </li>
          </ul>
        </section>

        <section id="politiques-couverture">
          <h3>Couverture par les nœuds</h3>
          <p>
            Chaque mesure affiche un badge <strong>« ✓ couvert »</strong> dès lors qu’au moins un
            nœud de l’arbre l’a référencée dans son panneau détail (cf.
            <a href="#arbo-detail">section Politiques publiques du panneau 3.3</a>).
          </p>
          <p>
            En bas de la page, le compteur « <strong>X portées par un nœud / Y total</strong> »
            donne le taux de couverture global. Une mesure non couverte signale qu’aucune page du
            site ne la porte explicitement — c’est généralement un trou éditorial à combler.
          </p>
          <p>
            <strong>Lien réciproque</strong> : depuis un nœud, le panneau détail (rubrique 3) liste
            les mesures rattachées avec un bouton « <code>↗ Voir dans politiques publiques</code> »
            pour sauter à l’édition de la mesure.
          </p>
        </section>
      </section>

      <!-- ============= 9. PARCOURS UTILISATEUR ============= -->
      <section id="parcours" class="help-section-l1">
        <h2>9. Parcours utilisateur</h2>

        <section id="parcours-concept">
          <h3>Hiérarchie : parcours et user stories</h3>
          <p>La page modélise ce que les usagers viennent faire, à <strong>2 niveaux</strong> :</p>
          <ul>
            <li>
              <strong>Parcours</strong> (groupe) — un thème ou un domaine métier, ex. « Onboarding
              nouveau client », « Réclamation », « Démarche d’aide ». Sert à regrouper des user
              stories qui partagent un même contexte. Repli/dépli persisté.
            </li>
            <li>
              <strong>User story</strong> (carte) — une tâche d’usager précise (« comparer deux
              aides », « savoir si je suis éligible »), avec son public-cible et son
              <strong>fil de fer d’étapes</strong>.
            </li>
          </ul>
          <p>
            Le thème (<code>vocab.story_themes</code> : navigation / information / action /
            transaction…) est posé <strong>sur chaque écran</strong> (étape) — il caractérise la
            nature de l’écran, pas la story qui le traverse.
          </p>
          <p>
            Différence avec <a href="#objectifs">la pyramide d’Objectifs</a> : la pyramide modélise
            les objectifs <em>institutionnels</em> (axes / objectifs / moyens). Le parcours modélise
            les objectifs <em>de l’usager</em>. Les deux coexistent et ne sont pas reliés
            directement.
          </p>
        </section>

        <section id="parcours-screens">
          <h3>Les 4 types d’écran</h3>
          <p>
            Chaque étape pointe vers un <strong>écran</strong>, qui peut être de 4 natures
            différentes — toutes interchangeables au gré de l’édition (cf. ADR-018 pour la
            modélisation) :
          </p>
          <ul>
            <li>
              <strong>Page</strong> (<code>kind: 'node'</code>) — un node de l’arborescence du
              projet. Bleu france, icône <code>fr-icon-file-line</code>.
            </li>
            <li>
              <strong>Bloc</strong> (<code>kind: 'block'</code>) — un paragraph DSFR précis dans la
              maquette d’un node (ref <code>nodeId#paragraphId</code>). Jaune, icône
              <code>fr-icon-stack-line</code>. Utile quand le visiteur s’arrête sur une section
              précise (formulaire, CTA, accordéon).
            </li>
            <li>
              <strong>Sortie externe</strong> (<code>kind: 'dispositif'</code>) — une ressource ou
              un service tiers (FranceConnect, démarches-simplifiées, mon-compte-formation…). Le
              visiteur sort du site. Violet, icône <code>fr-icon-external-link-line</code>.
            </li>
            <li>
              <strong>À définir</strong> (<code>kind: 'ghost'</code>) — placeholder à résoudre. En
              atelier, typique pour capturer une intention sans encore savoir si ce sera une page,
              un bloc ou une sortie. Gris pointillé, icône <code>fr-icon-question-line</code>.
            </li>
          </ul>
          <p>
            Les références cassées (un node supprimé entre-temps, un dispositif renommé) restent
            visibles avec un sous-titre « lien rompu » — vous pouvez les ré-affecter via le picker.
          </p>
        </section>

        <section id="parcours-promotion">
          <h3>Créer depuis le picker (mode atelier)</h3>
          <p>
            Cliquer sur la pastille kind d’une carte d’étape ouvre le <strong>picker</strong> :
            modale full-screen à 4 onglets (Indéfini / Page / Bloc / Sortie externe), un par kind,
            avec recherche dans chaque.
          </p>
          <p>
            Dans l’onglet <strong>Indéfini</strong>, vous saisissez un titre et une description
            libre. Deux boutons de <em>promotion</em> apparaissent à côté de « Enregistrer en l’état
            » :
          </p>
          <ul>
            <li>
              <strong>Créer comme page</strong> — ajoute un node à la racine de l’arborescence avec
              ce titre comme libellé et la description comme TL;DR. Vous pourrez ensuite le ranger à
              sa place via la rubrique <a href="#arborescence">Arborescence</a>.
            </li>
            <li>
              <strong>Créer comme sortie externe</strong> — ajoute un dispositif au catalogue
              <a href="#ressources">Ressources & services</a> avec ce titre et cette description.
            </li>
          </ul>
          <p>
            C’est un mode de travail inverse de l’habituel : on capture le parcours en atelier sans
            avoir encore d’arbo posée, et l’arbo se construit naturellement par les promotions.
          </p>
        </section>

        <section id="parcours-branches">
          <h3>Embranchements conditionnels</h3>
          <p>
            Chaque carte d’étape porte un bouton <strong>« Branche »</strong>. Une branche déclare
            une <em>condition</em> (« Si éligible », « Si non connecté »…) et une
            <em>sous-suite d’étapes</em> qui en découle. Le rendu : sous le rail principal, un
            sous-rail indenté avec barre verticale orangée.
          </p>
          <p>
            <strong>Profondeur 1 maximum</strong>, verrouillé par le type côté code : les étapes
            d’une branche ne peuvent pas elles-mêmes brancher. Si vous avez besoin de plus, c’est
            que la story doit être découpée en deux. Pas de fusion explicite non plus — si une
            branche doit « revenir au flux principal », notez-le dans le champ Commentaire.
          </p>
          <p>
            Ce verrou est volontaire : il garde l’éditeur visuellement simple et empêche la dérive
            vers un outil de workflow BPMN.
          </p>
        </section>

        <section id="parcours-drag">
          <h3>Drag-and-drop : tout est déplaçable</h3>
          <p>
            Une poignée <code>fr-icon-drag-move-2-line</code> (≡) est affichée sur les 3 niveaux —
            parcours, user stories, étapes. Glisser sur la moitié supérieure/inférieure (ou
            gauche/droite pour les étapes) de la cible définit l’insertion avant ou après ; un trait
            bleu matérialise la position.
          </p>
          <ul>
            <li><strong>Parcours</strong> : réordonner les groupes verticalement.</li>
            <li>
              <strong>User stories</strong> : réordonner dans un parcours, ou les déplacer d’un
              parcours à un autre (drop sur une story cible, ou directement dans la zone du parcours
              pour append à la fin).
            </li>
            <li>
              <strong>Étapes</strong> : réordonner dans une story, ou les déplacer d’une story à une
              autre (cross-story). Les sub-steps d’une branche se réorganisent dans la même branche.
            </li>
          </ul>
          <p>
            Les alternatives clavier-friendly restent disponibles : flèches ◀ ▶ sur chaque étape. Le
            drag ne s’amorce que depuis la poignée — pas en cliquant sur un input ou un bouton.
          </p>
        </section>
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

/* Sections de niveau 1 : marge généreuse + h2 plus marqué pour la
   hiérarchie visuelle. Les sous-sections gardent un h3 plus discret. */
.help-content .help-section-l1 {
  margin-bottom: 3.5rem;
  padding-top: 1rem;
  scroll-margin-top: 1rem;
}

.help-content .help-section-l1 > section {
  margin: 2rem 0;
  scroll-margin-top: 1rem;
}

.help-content h2 {
  font-size: 1.7rem;
  margin: 0 0 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--border-action-high-blue-france, #000091);
}

.help-content h3 {
  font-size: 1.2rem;
  margin: 1.5rem 0 0.5rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--border-default-grey, #ddd);
}

.help-content h4 {
  font-size: 1rem;
  margin: 1.2rem 0 0.4rem;
  font-weight: 600;
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

.help-content kbd {
  background: #f6f6f6;
  border: 1px solid #ccc;
  border-bottom-width: 2px;
  border-radius: 3px;
  padding: 0 0.4em;
  font-size: 0.85em;
  font-family: inherit;
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

/* Sidemenu à 2 niveaux : on cache la sous-liste par défaut et on la
   révèle uniquement sous le L1 « ouvert » (= contenant la sous-section
   active selon le scroll-spy). Indentation visuelle pour les L2.
   Les liens L1 restent gras pour les distinguer des L2. */
.help-sidemenu__l1 {
  font-weight: 600;
}

.help-sidemenu__sublist {
  display: none;
  padding-left: 0.75rem;
  border-left: 2px solid var(--border-default-grey, #ddd);
  margin: 0.25rem 0 0.5rem 0.75rem;
}

.help-sidemenu__item--open > .help-sidemenu__sublist {
  display: block;
}

.help-sidemenu__sublist .fr-sidemenu__link {
  font-size: 0.92rem;
  padding-top: 0.3rem;
  padding-bottom: 0.3rem;
  font-weight: 400;
}

/* Sur mobile : le sidemenu DSFR collapse automatiquement via le bouton
   « Dans cette page » (fr-sidemenu__btn). Notre seule contrainte est
   de ne pas le rendre sticky en colonne empilée — DSFR gère déjà
   `fr-sidemenu--sticky-full-height` côté responsive. */
</style>
