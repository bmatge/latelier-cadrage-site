import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Permission } from '@latelier/shared';
import { hasPermission } from '@latelier/shared';
import * as authApi from '../api/auth.api.js';
import type { AuthMode, MeUser } from '../api/auth.api.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<MeUser | null>(null);
  const authMode = ref<AuthMode>('local');
  const fetched = ref(false);

  async function fetchMe(): Promise<MeUser | null> {
    const res = await authApi.fetchMe();
    user.value = res.user;
    authMode.value = res.authMode;
    fetched.value = true;
    return user.value;
  }

  async function requestLogin(email: string): Promise<void> {
    await authApi.requestMagicLink(email);
  }

  async function consumeCallback(token: string): Promise<void> {
    await authApi.consumeCallback(token);
    await fetchMe();
  }

  async function logout(): Promise<void> {
    await authApi.logout();
    user.value = null;
  }

  const isAdmin = computed(() =>
    user.value ? user.value.roles.some((r) => r.role === 'admin' && r.projectId === null) : false,
  );

  // Mode proxy (ADR-062) : l'auth est gérée par le gate du lab en amont. L'UI
  // masque alors login et logout (le magic-link interne est désactivé côté
  // backend → 410, et la « déconnexion » relèverait du gate, pas de l'app).
  const isProxyMode = computed(() => authMode.value === 'proxy');

  function can(permission: Permission, projectId: number | null = null): boolean {
    if (!user.value) return false;
    const grants = user.value.roles.map((r) => ({ role: r.role, projectId: r.projectId }));
    return hasPermission(grants, permission, projectId);
  }

  return {
    user,
    authMode,
    fetched,
    fetchMe,
    requestLogin,
    consumeCallback,
    logout,
    isAdmin,
    isProxyMode,
    can,
  };
});
