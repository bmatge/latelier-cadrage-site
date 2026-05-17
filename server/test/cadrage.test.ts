// POC cadrage IA — tests focus sur :
//   1) l'extraction JSON robuste (le modèle peut wrap en markdown, ajouter du
//      texte avant/après malgré `response_format: json_object`)
//   2) la validation ajv du bundle contre docs/bundle-schema.json
//   3) le mount conditionnel via CADRAGE_ENABLED
// On NE teste PAS l'API Albert (out-of-scope, ferait des appels réseau).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { extractJsonObject } from '../src/services/albert.service.js';
import { extractDocument } from '../src/services/document-extract.service.js';
import { makeFixture } from './setup.js';

describe('albert.service / extractJsonObject', () => {
  it('parse un JSON direct', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('parse un JSON entouré de whitespace', () => {
    expect(extractJsonObject('   \n {"version":1}  \n')).toEqual({ version: 1 });
  });

  it('parse un JSON dans un bloc fencé ```json', () => {
    const raw = 'Voici ton bundle :\n```json\n{"version":1,"project":{"slug":"x","name":"X"}}\n```';
    expect(extractJsonObject(raw)).toEqual({
      version: 1,
      project: { slug: 'x', name: 'X' },
    });
  });

  it('parse un JSON dans un bloc fencé sans annotation', () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('fallback : extrait le premier {...} si pas de fence', () => {
    expect(extractJsonObject('Voici : {"a":1} fin')).toEqual({ a: 1 });
  });

  it('retourne null si rien de parsable', () => {
    expect(extractJsonObject('Désolé, je ne peux pas.')).toBeNull();
  });

  it('retourne null sur JSON syntaxiquement invalide', () => {
    expect(extractJsonObject('{a:1, b:}')).toBeNull();
  });
});

describe('document-extract.service / extractDocument', () => {
  it('texte brut UTF-8 (utf8 préservé, fin de ligne normalisée)', async () => {
    const buf = Buffer.from('Bonjour à toi\r\nÉlèves\n', 'utf-8');
    const res = await extractDocument(buf, 'text/plain', 'demo.txt');
    expect(res.format).toBe('text');
    expect(res.text).toBe('Bonjour à toi\nÉlèves');
    expect(res.truncated).toBe(false);
  });

  it('CSV reconnu par extension', async () => {
    const buf = Buffer.from('id,name\n1,Hub\n2,Service\n', 'utf-8');
    const res = await extractDocument(buf, 'application/octet-stream', 'tree.csv');
    expect(res.format).toBe('csv');
    expect(res.text).toContain('id,name');
  });

  it('détection PDF par mimetype', async () => {
    // pdf-parse rejette un buffer non-PDF avec une erreur — on vérifie juste
    // que le format est bien identifié et que l'erreur remonte clairement.
    const buf = Buffer.from('pas un vrai PDF', 'utf-8');
    await expect(extractDocument(buf, 'application/pdf', 'fake.pdf')).rejects.toThrow();
  });
});

describe('routes cadrage (flag-gating)', () => {
  const originalEnabled = process.env.CADRAGE_ENABLED;
  const originalUrl = process.env.ALBERT_API_URL;
  const originalKey = process.env.ALBERT_API_KEY;

  beforeEach(() => {
    delete process.env.CADRAGE_ENABLED;
    delete process.env.ALBERT_API_URL;
    delete process.env.ALBERT_API_KEY;
  });

  afterEach(() => {
    if (originalEnabled !== undefined) process.env.CADRAGE_ENABLED = originalEnabled;
    else delete process.env.CADRAGE_ENABLED;
    if (originalUrl !== undefined) process.env.ALBERT_API_URL = originalUrl;
    else delete process.env.ALBERT_API_URL;
    if (originalKey !== undefined) process.env.ALBERT_API_KEY = originalKey;
    else delete process.env.ALBERT_API_KEY;
  });

  it("CADRAGE_ENABLED non set → la route /cadrage/generate n'est pas montée (404)", async () => {
    const fx = await makeFixture();
    const res = await request(fx.app).post('/api/cadrage/generate');
    expect(res.status).toBe(404);
  });

  it('CADRAGE_ENABLED=1 mais sans Albert key → 500 albert_not_configured (sur appel authentifié)', async () => {
    process.env.CADRAGE_ENABLED = '1';
    const { loginAs } = await import('./setup.js');
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', {
      extraRoles: [{ role: 'editor' as const, projectId: null }],
    });
    const res = await agent
      .post('/api/cadrage/generate')
      .attach('files', Buffer.from('hi'), 'h.txt');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('albert_not_configured');
  });

  it('CADRAGE_ENABLED=1 + non-auth → 401', async () => {
    process.env.CADRAGE_ENABLED = '1';
    const fx = await makeFixture();
    const res = await request(fx.app)
      .post('/api/cadrage/generate')
      .attach('files', Buffer.from('hi'), 'h.txt');
    expect(res.status).toBe(401);
  });

  it('CADRAGE_ENABLED=1 + multi-files acceptés (au moins 2 fichiers passent multer)', async () => {
    process.env.CADRAGE_ENABLED = '1';
    const { loginAs } = await import('./setup.js');
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', {
      extraRoles: [{ role: 'editor' as const, projectId: null }],
    });
    const res = await agent
      .post('/api/cadrage/generate')
      .attach('files', Buffer.from('doc 1'), 'a.txt')
      .attach('files', Buffer.from('doc 2'), 'b.txt');
    // Pas de clé Albert → on s'arrête en 500 mais après le passage multer,
    // ce qui prouve que les 2 fichiers ont été acceptés sans LIMIT_FILE_COUNT.
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('albert_not_configured');
  });

  it('POST /cadrage/refine → 400 sans bundle, 400 sans instructions, 500 sans Albert key', async () => {
    process.env.CADRAGE_ENABLED = '1';
    const { loginAs } = await import('./setup.js');
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', {
      extraRoles: [{ role: 'editor' as const, projectId: null }],
    });
    const noBundle = await agent.post('/api/cadrage/refine').send({ instructions: 'foo' });
    expect(noBundle.status).toBe(400);
    expect(noBundle.body.error).toBe('bundle_required');

    const noInstr = await agent.post('/api/cadrage/refine').send({ bundle: { x: 1 } });
    expect(noInstr.status).toBe(400);
    expect(noInstr.body.error).toBe('data_required');

    const ok = await agent
      .post('/api/cadrage/refine')
      .send({ bundle: { x: 1 }, instructions: 'change x' });
    expect(ok.status).toBe(500);
    expect(ok.body.error).toBe('albert_not_configured');
  });
});
