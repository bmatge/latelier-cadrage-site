// Tests d'intégrité de l'import/export de bundles projet. Couvre :
//  - Round-trip (l'export d'un projet importé donne le même bundle aux
//    métadonnées près).
//  - Fallbacks : un bundle sans `data.vocab` doit retomber sur LEGACY_VOCAB
//    (et pas DEFAULT_VOCAB) — c'est le bug du cutover 2026-05-17 où le
//    projet historique a perdu ses chips audiences/échéances/page_types
//    parce que le bundle utilisé était antérieur à l'inclusion de la clé
//    `vocab` dans `EXPORT_KEYS`.
//  - Fallback objectifs : si la clé est absente ou malformée, on injecte
//    `{ axes: [] }` (et pas une coquille `{ axes, objectives, means }`).

import { describe, it, expect } from 'vitest';
import { sql } from 'kysely';
import { seedDefaultProject } from '../src/services/seed.service.js';
import { loginAs, makeFixture } from './setup.js';

const EDITOR = { extraRoles: [{ role: 'editor' as const, projectId: null }] };

const MINIMAL_PROJECT = {
  slug: 'sans-vocab',
  name: 'Bundle ancien sans data.vocab',
  description: '',
};

describe('import-export bundle integrity', () => {
  it('round-trip : export → import → export produit le même contenu', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const original = (await agent.get('/api/projects/portail-electrification/export')).body;
    const cloned = structuredClone(original);
    cloned.project.slug = 'clone';
    cloned.project.name = 'Clone';

    const imported = await agent.post('/api/projects/import').send({ bundle: cloned });
    expect(imported.status).toBe(201);

    const reExported = (await agent.get('/api/projects/clone/export')).body;
    expect(reExported.data.vocab).toEqual(original.data.vocab);
    expect(reExported.data.mesures).toEqual(original.data.mesures);
    expect(reExported.data.objectifs).toEqual(original.data.objectifs);
    expect(reExported.data.drupal_structure).toEqual(original.data.drupal_structure);
    expect(reExported.tree).toEqual(original.tree);
    expect(reExported.roadmap).toEqual(original.roadmap);
    // dispositifs : non strictement égal car le seed du projet historique
    // (assets/seed-data/dispositifs.json, format v1) porte encore `audience:
    // string`, normalisé en `audiences: [string]` au passage de l'import.
    // Cf. test dédié « migration dispositif.audience → audiences[] » ci-dessous.
    expect(reExported.data.dispositifs.dispositifs).toHaveLength(
      original.data.dispositifs.dispositifs.length,
    );
  });

  it('bundle sans `data.vocab` → fallback LEGACY_VOCAB (régression cutover 2026-05-17)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const oldBundle = {
      version: 1,
      project: MINIMAL_PROJECT,
      tree: { id: 'root', label: MINIMAL_PROJECT.name, type: 'hub', children: [] },
      roadmap: { meta: {}, items: [] },
      data: {
        // pas de `vocab` ici : simulation d'un export v1.x
        dispositifs: { dispositifs: [] },
        mesures: { mesures: [] },
        objectifs: { axes: [] },
        drupal_structure: {
          content_types: [],
          paragraphs: [],
          paragraph_labels: {},
          taxonomies: [],
        },
      },
    };

    const imported = await agent.post('/api/projects/import').send({ bundle: oldBundle });
    expect(imported.status).toBe(201);

    const vocab = (await agent.get(`/api/projects/${MINIMAL_PROJECT.slug}/data/vocab`)).body.data;
    expect(vocab.audiences).toContainEqual({ key: 'particuliers', label: 'Particuliers' });
    expect(vocab.deadlines).toContainEqual({ key: 'juin', label: 'Juin 2026' });
    expect(vocab.page_types).toContainEqual({ key: 'editorial', label: 'Éditorial' });
    expect(vocab.audiences.length).toBe(9);
    expect(vocab.deadlines.length).toBe(4);
    expect(vocab.page_types.length).toBe(10);
  });

  it('bundle avec `data.vocab` custom → vocab préservé (pas écrasé par le fallback)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const customVocab = {
      audiences: [{ key: 'eleves', label: 'Élèves' }],
      deadlines: [{ key: 'rentree', label: 'Rentrée 2026' }],
      page_types: [{ key: 'cours', label: 'Cours' }],
    };
    const bundle = {
      version: 1,
      project: { slug: 'avec-vocab', name: 'Bundle avec vocab', description: '' },
      tree: { id: 'root', label: 'Bundle avec vocab', type: 'hub', children: [] },
      roadmap: { meta: {}, items: [] },
      data: {
        dispositifs: { dispositifs: [] },
        mesures: { mesures: [] },
        objectifs: { axes: [] },
        drupal_structure: {
          content_types: [],
          paragraphs: [],
          paragraph_labels: {},
          taxonomies: [],
        },
        vocab: customVocab,
      },
    };

    await agent.post('/api/projects/import').send({ bundle });
    const vocab = (await agent.get('/api/projects/avec-vocab/data/vocab')).body.data;
    expect(vocab).toEqual(customVocab);
  });

  it('bundle avec `data.objectifs` absent → fallback `{ axes: [] }` (pas une coquille flat)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const bundle = {
      version: 1,
      project: { slug: 'sans-objectifs', name: 'Sans objectifs', description: '' },
      tree: { id: 'root', label: 'Sans objectifs', type: 'hub', children: [] },
      roadmap: { meta: {}, items: [] },
      data: {},
    };

    await agent.post('/api/projects/import').send({ bundle });
    const objectifs = (await agent.get('/api/projects/sans-objectifs/data/objectifs')).body.data;
    expect(objectifs).toEqual({ axes: [] });
    expect(objectifs).not.toHaveProperty('objectives');
    expect(objectifs).not.toHaveProperty('means');
  });

  it('création de projet (POST /projects) → vocab DEFAULT (pas LEGACY) car nouveau projet neuf', async () => {
    // Garde-fou contre une régression du fix B2 : on doit bien distinguer
    // « projet neuf » (DEFAULT_VOCAB minimaliste) vs « import d'un vieux
    // bundle » (LEGACY_VOCAB plan d'électrification).
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    await agent.post('/api/projects').send({ slug: 'neuf', name: 'Projet neuf' });
    const vocab = (await agent.get('/api/projects/neuf/data/vocab')).body.data;
    expect(vocab.audiences).toEqual([{ key: 'tous-publics', label: 'Tous publics' }]);
    expect(vocab.deadlines.length).toBe(3);
    expect(vocab.page_types.length).toBe(3);
  });

  it('création de projet → objectifs `{ axes: [] }` (pas une coquille flat)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    await agent.post('/api/projects').send({ slug: 'neuf2', name: 'Projet neuf 2' });
    const objectifs = (await agent.get('/api/projects/neuf2/data/objectifs')).body.data;
    expect(objectifs).toEqual({ axes: [] });
  });

  it('seedDefaultProject ne crashe pas si le projet historique id=1 a été supprimé (régression FK 2026-05-17)', async () => {
    // Scénario : un admin a delete le projet historique (id=1) et ré-importé
    // sous un autre id. Au reboot, seedDefaultProject doit skip ses INSERT
    // project_data hardcodés sur project_id=1 — sinon FOREIGN KEY violation
    // → crash → restart loop (cf. cutover prod 2026-05-17).
    const fx = await makeFixture();
    await sql`PRAGMA defer_foreign_keys = ON`.execute(fx.k);
    await fx.k.deleteFrom('project_data').where('project_id', '=', 1).execute();
    await fx.k.deleteFrom('revisions').where('project_id', '=', 1).execute();
    await fx.k.deleteFrom('roadmap_revisions').where('project_id', '=', 1).execute();
    await fx.k.deleteFrom('projects').where('id', '=', 1).execute();

    await expect(seedDefaultProject(fx.k)).resolves.toBeUndefined();
  });

  it('export inclut bien la clé `vocab` (cf. EXPORT_KEYS)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const res = await agent.get('/api/projects/portail-electrification/export');
    expect(res.body.data).toHaveProperty('vocab');
    expect(res.body.data.vocab).toHaveProperty('audiences');
    expect(res.body.data.vocab).toHaveProperty('deadlines');
    expect(res.body.data.vocab).toHaveProperty('page_types');
  });

  it('export inclut bien la clé `user_stories` (cf. ADR-018)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const res = await agent.get('/api/projects/portail-electrification/export');
    expect(res.body.data).toHaveProperty('user_stories');
    expect(res.body.data.user_stories).toEqual({ stories: [] });
  });

  it('bundle sans `data.user_stories` → fallback `{ stories: [] }`', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const bundle = {
      version: 1,
      project: { slug: 'parcours-fallback', name: 'Parcours fallback', description: '' },
      tree: { id: 'root', label: 'P', type: 'hub', children: [] },
      roadmap: { meta: {}, items: [] },
      data: {
        // user_stories absent
        dispositifs: { dispositifs: [] },
        mesures: { mesures: [] },
        objectifs: { axes: [] },
        drupal_structure: {
          content_types: [],
          paragraphs: [],
          paragraph_labels: {},
          taxonomies: [],
        },
        vocab: { audiences: [], deadlines: [], page_types: [] },
      },
    };

    const imported = await agent.post('/api/projects/import').send({ bundle });
    expect(imported.status).toBe(201);

    const stored = (await agent.get('/api/projects/parcours-fallback/data/user_stories')).body.data;
    expect(stored).toEqual({ stories: [] });
  });

  it('round-trip user_stories : export → import → export préserve les stories', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    // 1. on pose des stories sur le projet historique
    const userStories = {
      stories: [
        {
          id: 'us-1',
          label: 'Comparer 2 aides',
          audience_key: 'particuliers',
          theme_key: 'information',
          description: 'Cas test',
          steps: [
            {
              id: 'st-1',
              screen: { kind: 'node', ref: 'root', title: 'Accueil' },
              action: 'Cliquer sur comparer',
              comment: '',
              branches: [
                {
                  id: 'br-1',
                  condition: 'Si éligible',
                  steps: [
                    {
                      id: 'st-2',
                      screen: { kind: 'ghost', ref: null, title: 'Page suite' },
                      action: 'Continuer',
                      comment: '',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    await agent
      .put('/api/projects/portail-electrification/data/user_stories')
      .send({ data: userStories });

    // 2. on exporte + clone + ré-importe
    const original = (await agent.get('/api/projects/portail-electrification/export')).body;
    expect(original.data.user_stories).toEqual(userStories);

    const cloned = structuredClone(original);
    cloned.project.slug = 'parcours-clone';
    cloned.project.name = 'Parcours clone';
    const imp = await agent.post('/api/projects/import').send({ bundle: cloned });
    expect(imp.status).toBe(201);

    // 3. l'export du clone doit contenir les mêmes stories
    const reExported = (await agent.get('/api/projects/parcours-clone/export')).body;
    expect(reExported.data.user_stories).toEqual(userStories);
  });

  it("migration dispositif.audience (string legacy) → audiences[] à l'import", async () => {
    // Bundles v1 et sorties Albert pluralisent spontanément le champ. Le
    // serveur doit normaliser les 3 formes en `audiences: [...]` (drop le
    // legacy `audience`).
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const bundle = {
      version: 1,
      project: { slug: 'migration-test', name: 'Migration test', description: '' },
      tree: { id: 'root', label: 'Migration test', type: 'hub', children: [] },
      roadmap: { meta: {}, items: [] },
      data: {
        dispositifs: {
          dispositifs: [
            { id: 'D-LEGACY1', name: 'Legacy string', audience: 'particuliers' },
            {
              id: 'D-LEGACY2',
              name: 'Legacy array sur audience',
              audience: ['pros', 'collectivites'],
            },
            { id: 'D-V2', name: 'Déjà au format v2', audiences: ['particuliers', 'pros'] },
            { id: 'D-EMPTY', name: 'Sans audience' },
            { id: 'D-WHITESPACE', name: 'Audience vide', audience: '   ' },
          ],
        },
      },
    };

    await agent.post('/api/projects/import').send({ bundle });
    const dispositifs = (await agent.get('/api/projects/migration-test/data/dispositifs')).body.data
      .dispositifs as readonly Record<string, unknown>[];

    const byId = new Map(dispositifs.map((d) => [d['id'], d] as const));
    expect(byId.get('D-LEGACY1')).toMatchObject({ audiences: ['particuliers'] });
    expect(byId.get('D-LEGACY1')).not.toHaveProperty('audience');
    expect(byId.get('D-LEGACY2')).toMatchObject({ audiences: ['pros', 'collectivites'] });
    expect(byId.get('D-LEGACY2')).not.toHaveProperty('audience');
    expect(byId.get('D-V2')).toMatchObject({ audiences: ['particuliers', 'pros'] });
    expect(byId.get('D-EMPTY')).not.toHaveProperty('audiences');
    expect(byId.get('D-EMPTY')).not.toHaveProperty('audience');
    expect(byId.get('D-WHITESPACE')).not.toHaveProperty('audiences');
    expect(byId.get('D-WHITESPACE')).not.toHaveProperty('audience');
  });

  it('normalise drupal_structure.taxonomies[*].options et content_types : objets {key,label} → strings (cas LLM Albert)', async () => {
    // Albert (et d'autres LLM) extrapolent souvent les listes de labels en
    // objets [{key, label}, ...] parce qu'ils voient ce shape ailleurs.
    // Côté Drupal on n'a besoin que du label affichable — coerce vers
    // string[] au boundary import.
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const bundle = {
      version: 1,
      project: { slug: 'llm-objects', name: 'LLM objects', description: '' },
      tree: { id: 'root', label: 'LLM objects', type: 'hub', children: [] },
      roadmap: { meta: {}, items: [] },
      data: {
        drupal_structure: {
          content_types: [
            'page',
            { key: 'article', label: 'Article' },
            { label: 'Service' },
            { name: 'Hub' },
            { id: 'kit' },
            '',
            { label: '   ' },
          ],
          paragraphs: ['accordion'],
          taxonomies: [
            {
              key: 'audience',
              label: 'Audience',
              multi: true,
              options: [
                { key: 'particuliers', label: 'Particuliers' },
                { key: 'pros', label: 'Pros' },
                'mixte',
              ],
            },
          ],
        },
      },
    };

    await agent.post('/api/projects/import').send({ bundle });
    const ds = (await agent.get('/api/projects/llm-objects/data/drupal_structure')).body.data;
    expect(ds.content_types).toEqual(['page', 'Article', 'Service', 'Hub', 'kit']);
    expect(ds.taxonomies[0].options).toEqual(['Particuliers', 'Pros', 'mixte']);
  });

  it('normalise dispositifs.meta.categories (objets {label} → strings)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);
    const bundle = {
      version: 1,
      project: { slug: 'cat-objects', name: 'Cat objects', description: '' },
      tree: { id: 'root', label: 'Cat objects', type: 'hub', children: [] },
      roadmap: { meta: {}, items: [] },
      data: {
        dispositifs: {
          meta: {
            categories: [
              'Logement',
              { label: 'Mobilités' },
              { key: 'industrie', label: 'Industrie' },
            ],
          },
          dispositifs: [],
        },
      },
    };
    await agent.post('/api/projects/import').send({ bundle });
    const data = (await agent.get('/api/projects/cat-objects/data/dispositifs')).body.data;
    expect(data.meta.categories).toEqual(['Logement', 'Mobilités', 'Industrie']);
  });

  it('PUT /data/drupal_structure normalise aussi (boundary write)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);
    await agent.put('/api/projects/portail-electrification/data/drupal_structure').send({
      data: {
        content_types: [{ label: 'Custom' }],
        paragraphs: ['accordion'],
        taxonomies: [{ key: 'x', label: 'X', multi: false, options: [{ label: 'Opt' }] }],
      },
    });
    const ds = (await agent.get('/api/projects/portail-electrification/data/drupal_structure')).body
      .data;
    expect(ds.content_types).toEqual(['Custom']);
    expect(ds.taxonomies[0].options).toEqual(['Opt']);
  });

  it('PUT /data/dispositifs normalise aussi audience → audiences[] (boundary write)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    await agent.put('/api/projects/portail-electrification/data/dispositifs').send({
      data: {
        dispositifs: [{ id: 'D-X', name: 'X', audience: 'particuliers' }],
      },
    });
    const dispositifs = (await agent.get('/api/projects/portail-electrification/data/dispositifs'))
      .body.data.dispositifs as readonly Record<string, unknown>[];
    expect(dispositifs[0]).toMatchObject({ id: 'D-X', audiences: ['particuliers'] });
    expect(dispositifs[0]).not.toHaveProperty('audience');
  });
});
