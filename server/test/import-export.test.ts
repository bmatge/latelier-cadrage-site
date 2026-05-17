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
    expect(reExported.data.dispositifs).toEqual(original.data.dispositifs);
    expect(reExported.data.mesures).toEqual(original.data.mesures);
    expect(reExported.data.objectifs).toEqual(original.data.objectifs);
    expect(reExported.data.drupal_structure).toEqual(original.data.drupal_structure);
    expect(reExported.tree).toEqual(original.tree);
    expect(reExported.roadmap).toEqual(original.roadmap);
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
});
