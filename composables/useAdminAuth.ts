import type { User } from '@supabase/supabase-js';

type AccessResult = {
  allowed: boolean;
  user?: User;
  reason?: 'not-configured' | 'signed-out' | 'no-membership' | 'verification-failed';
};

export function useAdminAuth() {
  const { $supabase } = useNuxtApp();
  const user = useState<User | null>('admin-auth-user', () => null);

  async function checkOwnerAccess(): Promise<AccessResult> {
    if (!$supabase) return { allowed: false, reason: 'not-configured' };

    const { data: userResult, error: userError } = await $supabase.auth.getUser();
    if (userError || !userResult.user) {
      user.value = null;
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
      return { allowed: false, reason: 'verification-failed' };
    }

    const allowed = memberships?.some((membership) => membership.role === 'owner') ?? false;
    if (!allowed) {
      user.value = null;
      return { allowed: false, reason: 'no-membership' };
    }

    user.value = userResult.user;
    return { allowed: true, user: userResult.user };
  }

  async function signOut() {
    if (!$supabase) return;
    await $supabase.auth.signOut();
    user.value = null;
  }

  return { user, checkOwnerAccess, signOut, configured: Boolean($supabase) };
}
