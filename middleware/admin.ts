export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;

  const auth = useAdminAuth();
  const result = await auth.checkOwnerAccess();
  if (!result.allowed) {
    return navigateTo({
      path: '/painel/login',
      query: { next: to.fullPath },
    });
  }
});
