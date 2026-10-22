export function useWhatsAppLink(message: string) {
  const config = useRuntimeConfig();
  const phone = String(config.public.whatsappNumber || '').replace(/\D/g, '');
  return computed(() => `https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
}
