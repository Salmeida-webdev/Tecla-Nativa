import type { User } from '@supabase/supabase-js';

type AccessResult = {
  allowed: boolean;
  user?: User;
  reason?: 'not-configured' | 'signed-out' | 'no-membership' | 'verification-failed';
};

export function useAdminAuth() {
  const { $supabase } = useNuxtApp();
  const user = useState<User | null>('admin-auth-user', () => null);
  const role = useState<string | null>('admin-auth-role', () => null);

  async function checkOwnerAccess(): Promise<AccessResult> {
    if (!$supabase) return { allowed: false, reason: 'not-configured' };

    const { data: userResult, error: userError } = await $supabase.auth.getUser();
    if (userError || !userResult.user) {
      user.value = null;
      role.value = null;
      return { allowed: false, reason: 'signed-out' };
    }

    const { data: memberships, error: membershipError } = await $supabase
      .from('store_memberships')
      .select('role,status,stores!inner(slug)')
      .eq('user_id', userResult.user.id)
      .eq('status', 'active')
      .eq('stores.slug', 'tecla-nativa');

    if (membershipError) {
      user.value = null;
      role.value = null;
      return { allowed: false, reason: 'verification-failed' };
    }

    const activeMembership = memberships?.find((membership) => membership.status === 'active') ?? null;
    const allowed = Boolean(activeMembership);
    if (!allowed) {
      user.value = null;
      role.value = null;
      return { allowed: false, reason: 'no-membership' };
    }

    user.value = userResult.user;
    role.value = activeMembership?.role ?? null;
    return { allowed: true, user: userResult.user };
  }

  async function signOut() {
    if (!$supabase) return;
    await $supabase.auth.signOut();
    user.value = null;
    role.value = null;
  }

  return { user, role, checkOwnerAccess, signOut, configured: Boolean($supabase) };
}
