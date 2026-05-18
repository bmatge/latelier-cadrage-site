<script setup lang="ts">
// Page Admin v2 : gestion users + rôles per-project + invitation + audit.
//
// Toutes les actions vont via /api/admin/* (sauf l'invitation qui utilise
// /api/auth/magic-link, public anti-énumération avec rate-limit). L'admin
// invite un email → l'user reçoit le magic link, se logge → viewer global
// auto → admin retourne ici pour granter le rôle souhaité.

import { computed, onMounted, ref } from 'vue';
import { api } from '../api/client.js';
import { useConfirm } from '../stores/confirm.js';

const confirmStore = useConfirm();

interface RoleGrant {
  readonly role: 'admin' | 'editor' | 'viewer';
  readonly projectId: number | null;
}
interface AdminUser {
  readonly id: number;
  readonly display_name: string;
  readonly email: string | null;
  readonly status: 'active' | 'disabled' | 'pending';
  readonly roles: readonly RoleGrant[];
}
interface AuditEntry {
  readonly id: number;
  readonly action: string;
  readonly created_at: string;
  readonly actor_id: number | null;
  readonly actor_display_name: string | null;
  readonly actor_email: string | null;
  readonly project_id: number | null;
  readonly details: string | null;
}
interface AdminSession {
  readonly id: number;
  readonly user_id: number;
  readonly user_display_name: string;
  readonly user_email: string | null;
  readonly user_status: 'active' | 'disabled' | 'pending';
  readonly ip: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
  readonly last_seen_at: string | null;
  readonly expires_at: string;
  readonly revoked_at: string | null;
}
interface ProjectLite {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
}

type SessionStatus = 'active' | 'revoked' | 'expired';

const users = ref<readonly AdminUser[]>([]);
const audit = ref<readonly AuditEntry[]>([]);
const sessions = ref<readonly AdminSession[]>([]);
const projects = ref<readonly ProjectLite[]>([]);
const loading = ref(false);
const errorMsg = ref<string | null>(null);
const search = ref('');

// Filtres section sessions : par défaut on cache les sessions
// révoquées/expirées (uniquement les actives), un toggle les ramène.
const sessionsShowAll = ref(false);

// Invitation
const invitingEmail = ref('');
const invitationStatus = ref<'idle' | 'sending' | 'sent' | 'error'>('idle');
const invitationError = ref<string | null>(null);

// Modal "Ajouter un rôle"
const grantModalUser = ref<AdminUser | null>(null);
const grantModalRole = ref<'admin' | 'editor' | 'viewer'>('editor');
const grantModalProject = ref<number | 'global'>('global');

async function refresh(): Promise<void> {
  loading.value = true;
  errorMsg.value = null;
  try {
    const [u, a, p, s] = await Promise.all([
      api.get('/admin/users'),
      api.get('/admin/audit-log', { params: { limit: 50 } }),
      api.get('/projects'),
      api.get('/admin/sessions', {
        params: sessionsShowAll.value
          ? { limit: 100 }
          : { include_revoked: 'false', include_expired: 'false', limit: 100 },
      }),
    ]);
    users.value = (u.data as { users: readonly AdminUser[] }).users;
    audit.value = (a.data as { entries: readonly AuditEntry[] }).entries;
    projects.value = (p.data as { projects: readonly ProjectLite[] }).projects;
    sessions.value = (s.data as { sessions: readonly AdminSession[] }).sessions;
  } catch (e) {
    errorMsg.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function toggleShowAllSessions(): Promise<void> {
  sessionsShowAll.value = !sessionsShowAll.value;
  await refresh();
}

function sessionStatus(s: AdminSession): SessionStatus {
  if (s.revoked_at !== null) return 'revoked';
  if (new Date(s.expires_at).getTime() < Date.now()) return 'expired';
  return 'active';
}

async function revokeSession(s: AdminSession): Promise<void> {
  const ok = await confirmStore.ask({
    title: `Révoquer la session de ${s.user_email ?? s.user_display_name} ?`,
    message:
      "L'utilisateur sera déconnecté immédiatement. Sa prochaine action API renverra 401, il devra redemander un lien magique.",
    confirmLabel: 'Révoquer cette session',
    danger: true,
  });
  if (!ok) return;
  await api.delete(`/admin/sessions/${s.id}`);
  await refresh();
}

function actorLabel(e: AuditEntry): string {
  if (e.actor_email !== null && e.actor_email.length > 0) return e.actor_email;
  if (e.actor_display_name !== null && e.actor_display_name.length > 0) return e.actor_display_name;
  if (e.actor_id !== null) return `#${e.actor_id}`;
  return '—';
}

onMounted(refresh);

const projectSlugById = computed(() => {
  const map = new Map<number, string>();
  for (const p of projects.value) map.set(p.id, p.slug);
  return map;
});

function formatRole(r: RoleGrant): string {
  const scope =
    r.projectId === null ? 'global' : (projectSlugById.value.get(r.projectId) ?? `#${r.projectId}`);
  return `${r.role} (${scope})`;
}

const filteredUsers = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return users.value;
  return users.value.filter(
    (u) =>
      (u.email ?? '').toLowerCase().includes(term) ||
      u.display_name.toLowerCase().includes(term) ||
      u.roles.some((r) => r.role.includes(term)),
  );
});

async function toggleStatus(u: AdminUser): Promise<void> {
  const action = u.status === 'active' ? 'disable' : 'enable';
  await api.post(`/admin/users/${u.id}/${action}`);
  await refresh();
}

function openGrantModal(u: AdminUser): void {
  grantModalUser.value = u;
  grantModalRole.value = 'editor';
  grantModalProject.value = 'global';
}

function closeGrantModal(): void {
  grantModalUser.value = null;
}

async function applyGrant(): Promise<void> {
  if (!grantModalUser.value) return;
  const payload: { role: string; project_id?: number } = { role: grantModalRole.value };
  if (grantModalProject.value !== 'global') payload.project_id = grantModalProject.value;
  await api.post(`/admin/users/${grantModalUser.value.id}/roles`, payload);
  closeGrantModal();
  await refresh();
}

async function revoke(u: AdminUser, r: RoleGrant): Promise<void> {
  const scope =
    r.projectId === null ? 'global' : (projectSlugById.value.get(r.projectId) ?? '#' + r.projectId);
  const ok = await confirmStore.ask({
    title: `Retirer le rôle « ${r.role} » ?`,
    message: `L'utilisateur ${u.email ?? u.display_name} perdra son rôle ${r.role} sur le scope ${scope}.`,
    confirmLabel: 'Retirer le rôle',
    danger: true,
  });
  if (!ok) return;
  const body: { role: string; project_id?: number | null } = { role: r.role };
  if (r.projectId !== null) body.project_id = r.projectId;
  await api.delete(`/admin/users/${u.id}/roles`, { data: body });
  await refresh();
}

async function sendInvitation(): Promise<void> {
  const email = invitingEmail.value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    invitationError.value = 'Email invalide';
    invitationStatus.value = 'error';
    return;
  }
  invitationStatus.value = 'sending';
  invitationError.value = null;
  try {
    await api.post('/auth/magic-link', { email });
    invitationStatus.value = 'sent';
    invitingEmail.value = '';
    setTimeout(() => {
      invitationStatus.value = 'idle';
    }, 4000);
  } catch (e) {
    invitationError.value = (e as Error).message;
    invitationStatus.value = 'error';
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
</script>

<template>
  <div>
    <h1>Administration</h1>

    <p v-if="loading" style="color: #888">Chargement…</p>
    <p v-else-if="errorMsg" class="alert alert-error">{{ errorMsg }}</p>

    <!-- Invitation par email -->
    <section class="l-card">
      <h2 style="margin-top: 0">Inviter un utilisateur</h2>
      <p style="font-size: 0.9rem; color: #555">
        Envoie un magic link à un email. La personne clique → compte créé en <code>viewer</code>
        global. Pour donner d'autres rôles, utilisez ensuite le bouton « + rôle » dans la liste.
      </p>
      <form
        @submit.prevent="sendInvitation"
        style="display: flex; gap: 0.5rem; align-items: center"
      >
        <input
          v-model="invitingEmail"
          type="email"
          class="fr-input"
          placeholder="email@example.fr"
          required
          style="flex: 1; max-width: 320px"
        />
        <button class="fr-btn" type="submit" :disabled="invitationStatus === 'sending'">
          {{ invitationStatus === 'sending' ? 'Envoi…' : '✉ Envoyer le magic link' }}
        </button>
        <span v-if="invitationStatus === 'sent'" style="color: #18753c">✓ Lien envoyé</span>
        <span v-else-if="invitationStatus === 'error'" style="color: #ce0500">
          {{ invitationError }}
        </span>
      </form>
    </section>

    <!-- Liste users + recherche -->
    <section class="l-card">
      <div class="toolbar" style="margin: 0 0 0.75rem">
        <h2 style="margin: 0">Utilisateurs ({{ users.length }})</h2>
        <span class="spacer"></span>
        <input
          v-model="search"
          type="search"
          class="fr-input"
          placeholder="🔍 Filtrer par email / nom / rôle…"
          style="min-width: 260px"
        />
        <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="refresh">↻ Recharger</button>
      </div>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Nom</th>
            <th>Statut</th>
            <th>Rôles</th>
            <th style="width: 220px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filteredUsers" :key="u.id">
            <td>{{ u.email ?? '—' }}</td>
            <td>{{ u.display_name }}</td>
            <td>
              <span
                class="badge"
                :class="{
                  'badge-public': u.status === 'active',
                  'badge-private': u.status === 'disabled',
                }"
              >
                {{ u.status }}
              </span>
            </td>
            <td>
              <span v-if="u.roles.length === 0" style="color: #888; font-style: italic">
                aucun
              </span>
              <span
                v-for="r in u.roles"
                :key="`${r.role}-${r.projectId ?? 'g'}`"
                class="role-tag"
                :title="formatRole(r)"
              >
                {{ r.role }}
                <small v-if="r.projectId !== null" style="color: #444">
                  · {{ projectSlugById.get(r.projectId) ?? `#${r.projectId}` }}
                </small>
                <small v-else style="color: #444">· global</small>
                <button
                  class="role-tag__x"
                  title="Retirer ce rôle"
                  type="button"
                  @click="revoke(u, r)"
                >
                  ×
                </button>
              </span>
            </td>
            <td>
              <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="openGrantModal(u)">
                + rôle
              </button>
              <button class="fr-btn fr-btn--tertiary fr-btn--sm" @click="toggleStatus(u)">
                {{ u.status === 'active' ? '🚫 Désactiver' : '✓ Réactiver' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Sessions -->
    <section class="l-card">
      <div class="toolbar" style="margin: 0 0 0.75rem">
        <h2 style="margin: 0">
          Sessions
          <span style="color: #888; font-size: 0.85rem; font-weight: 400">
            ({{ sessions.length }} affichées)
          </span>
        </h2>
        <span class="spacer"></span>
        <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.88rem">
          <input type="checkbox" :checked="sessionsShowAll" @change="toggleShowAllSessions" />
          Inclure révoquées / expirées
        </label>
      </div>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Utilisateur</th>
            <th style="width: 80px">Statut</th>
            <th style="width: 140px">Créée</th>
            <th style="width: 140px">Dernière activité</th>
            <th style="width: 140px">Expire</th>
            <th>IP / navigateur</th>
            <th style="width: 120px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="sessions.length === 0">
            <td colspan="7" style="color: #888; font-style: italic; padding: 1rem">
              Aucune session à afficher.
            </td>
          </tr>
          <tr v-for="s in sessions" :key="s.id">
            <td>
              <strong>{{ s.user_email ?? s.user_display_name }}</strong>
              <small v-if="s.user_email" style="color: #666; display: block">
                {{ s.user_display_name }}
              </small>
            </td>
            <td>
              <span
                class="badge"
                :class="{
                  'badge-public': sessionStatus(s) === 'active',
                  'badge-private': sessionStatus(s) !== 'active',
                }"
                :title="
                  sessionStatus(s) === 'revoked'
                    ? `Révoquée le ${formatDate(s.revoked_at ?? '')}`
                    : sessionStatus(s) === 'expired'
                      ? `Expirée le ${formatDate(s.expires_at)}`
                      : ''
                "
              >
                {{
                  sessionStatus(s) === 'active'
                    ? 'active'
                    : sessionStatus(s) === 'revoked'
                      ? 'révoquée'
                      : 'expirée'
                }}
              </span>
            </td>
            <td>
              <small>{{ formatDate(s.created_at) }}</small>
            </td>
            <td>
              <small>{{ s.last_seen_at ? formatDate(s.last_seen_at) : '—' }}</small>
            </td>
            <td>
              <small>{{ formatDate(s.expires_at) }}</small>
            </td>
            <td>
              <small style="color: #666">{{ s.ip ?? '—' }}</small>
              <small
                v-if="s.user_agent"
                style="
                  display: block;
                  color: #888;
                  max-width: 280px;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                "
                :title="s.user_agent"
              >
                {{ s.user_agent }}
              </small>
            </td>
            <td>
              <button
                v-if="sessionStatus(s) === 'active'"
                class="fr-btn fr-btn--tertiary fr-btn--sm"
                style="color: #ce0500"
                @click="revokeSession(s)"
              >
                Révoquer
              </button>
              <span v-else style="color: #888; font-size: 0.85rem">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Audit log -->
    <section class="l-card">
      <h2 style="margin-top: 0">Journal d'audit (50 derniers)</h2>
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width: 140px">Quand</th>
            <th>Action</th>
            <th>Acteur</th>
            <th style="width: 100px">Projet</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in audit" :key="e.id">
            <td>
              <small>{{ formatDate(e.created_at) }}</small>
            </td>
            <td>
              <code>{{ e.action }}</code>
            </td>
            <td>
              <span :title="e.actor_id !== null ? `id #${e.actor_id}` : 'aucun acteur'">
                {{ actorLabel(e) }}
              </span>
            </td>
            <td>
              {{
                e.project_id === null
                  ? '—'
                  : (projectSlugById.get(e.project_id) ?? `#${e.project_id}`)
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Modal grant -->
    <div v-if="grantModalUser" class="modal-backdrop" @click.self="closeGrantModal">
      <div class="modal" role="dialog" aria-modal="true">
        <h2 style="margin-top: 0">
          Ajouter un rôle à {{ grantModalUser.email ?? grantModalUser.display_name }}
        </h2>
        <label class="field">
          <span>Rôle</span>
          <select v-model="grantModalRole" class="fr-select">
            <option value="viewer">viewer — lecture seule + commentaires</option>
            <option value="editor">editor — édition tree/data + delete own project</option>
            <option value="admin">admin — toutes les permissions</option>
          </select>
        </label>
        <label class="field">
          <span>Périmètre</span>
          <select v-model="grantModalProject" class="fr-select">
            <option value="global">🌐 Global (tous les projets)</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">
              📁 {{ p.slug }} — {{ p.name }}
            </option>
          </select>
        </label>
        <p style="font-size: 0.85rem; color: #666; margin-top: 0.75rem">
          <strong>Rappel</strong> : un grant global s'applique à tous les projets. Un grant
          per-project ne s'applique qu'à ce projet.
        </p>
        <div class="actions" style="display: flex; gap: 0.5rem; margin-top: 1rem">
          <button class="fr-btn" type="button" @click="applyGrant">Accorder</button>
          <button class="fr-btn fr-btn--secondary" type="button" @click="closeGrantModal">
            Annuler
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.admin-table th {
  text-align: left;
  border-bottom: 2px solid #ddd;
  padding: 0.5rem;
  background: #fafafa;
  font-weight: 600;
}
.admin-table td {
  border-bottom: 1px solid #eee;
  padding: 0.4rem 0.5rem;
}
.admin-table tr:hover td {
  background: #f9f9ff;
}
.role-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #e3e3fd;
  color: #00146b;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.8rem;
  margin-right: 0.25rem;
}
.role-tag__x {
  background: none;
  border: none;
  color: #ce0500;
  cursor: pointer;
  padding: 0;
  font-size: 1rem;
  line-height: 1;
  margin-left: 0.25rem;
}
.role-tag__x:hover {
  color: #6e0c0c;
}
.spacer {
  flex: 1;
}
</style>
