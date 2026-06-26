import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeFixture } from './setup.js';
import { resetConfigCache } from '../src/config/env.js';

// Mode proxy (ADR-062) : l'auth est déléguée au gate du lab, qui injecte l'email
// authentifié dans X-Gate-Email (posé autoritairement par Traefik, donc non
// forgeable car l'app n'est joignable que derrière lui). On force AUTH_MODE=proxy
// via l'env + resetConfigCache() AVANT makeFixture (loadConfig est mémoïsé et lu
// à la construction de l'app par attach-user et le contrôleur auth).
describe('auth — mode proxy (gate du lab, ADR-062)', () => {
  beforeEach(() => {
    process.env.AUTH_MODE = 'proxy';
    delete process.env.PROXY_AUTH_HEADER;
    resetConfigCache();
  });
  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.PROXY_AUTH_HEADER;
    resetConfigCache();
  });

  it('GET /api/me avec X-Gate-Email → 200, user résolu (lowercased) + auth_mode=proxy', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get('/api/me').set('X-Gate-Email', 'Alice@Test.FR');
    expect(res.status).toBe(200);
    expect(res.body.auth_mode).toBe('proxy');
    expect(res.body.user.email).toBe('alice@test.fr');
    expect(res.body.user.status).toBe('active');
    // Création implicite → viewer global par défaut (comme le self-signup).
    expect(res.body.user.roles).toEqual([{ role: 'viewer', projectId: null }]);
  });

  it('find-or-create : 2e requête même email → même user (pas de doublon)', async () => {
    const { app } = await makeFixture();
    const first = await request(app).get('/api/me').set('X-Gate-Email', 'bob@test.fr');
    const second = await request(app).get('/api/me').set('X-Gate-Email', 'bob@test.fr');
    expect(first.body.user.id).toBe(second.body.user.id);
  });

  it('GET /api/me SANS en-tête de confiance → 401 (aucune session interne)', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'identification_required' });
  });

  it('en-tête présent mais email invalide → 401 (pas de user forgé)', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get('/api/me').set('X-Gate-Email', 'notanemail');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/magic-link → 410 magic_link_disabled (interne désactivé)', async () => {
    const { app } = await makeFixture();
    const res = await request(app).post('/api/auth/magic-link').send({ email: 'alice@test.fr' });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('magic_link_disabled');
  });

  it('GET /api/auth/callback → 303 vers / (tout callback est caduc en proxy)', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get('/api/auth/callback?token=whatever');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/');
  });

  it('PROXY_AUTH_HEADER personnalisable → lit l’en-tête configuré', async () => {
    process.env.PROXY_AUTH_HEADER = 'x-forwarded-email';
    resetConfigCache();
    const { app } = await makeFixture();
    const res = await request(app).get('/api/me').set('X-Forwarded-Email', 'carol@test.fr');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('carol@test.fr');
  });
});
