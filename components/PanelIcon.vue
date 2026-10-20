<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
const paths: Record<string, string[]> = {
  grid: ['M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'],
  bag: ['M5 8h14l1 13H4L5 8Z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  box: ['m3 7 9-4 9 4-9 5-9-5Z', 'M3 7v10l9 4 9-4V7', 'M12 12v9', 'M7.5 9.5l9-5'],
  truck: ['M3 6h12v11H3z', 'M15 10h4l3 3v4h-7z', 'M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  tag: ['m20 13-7 7-10-10V3h7l10 10Z', 'M7.5 7.5h.01'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2', 'M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M20 8v6M23 11h-6'],
  chart: ['M3 3v18h18', 'm7 14 4-4 3 3 6-7'],
  page: ['M6 3h9l5 5v13H6z', 'M14 3v6h6', 'M9 13h8M9 17h8'],
  plug: ['M12 22v-5', 'M9 8V2M15 8V2', 'M5 8h14v3a7 7 0 0 1-14 0V8Z'],
  shield: ['M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z', 'm9 12 2 2 4-4'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 6v6l4 2'],
  settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.5 2.6-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3l-.1-.2a1.7 1.7 0 0 0-1.6-1.1h-.2l-2.6-1.5.1-.2a1.7 1.7 0 0 0-.3-1.9l-.1-.1v-3l.2-.1a1.7 1.7 0 0 0 1.1-1.6v-.2l1.5-2.6.2.1a1.7 1.7 0 0 0 1.9-.3l.1-.1h3l.1.2a1.7 1.7 0 0 0 1.6 1.1h.2l2.6 1.5-.1.2a1.7 1.7 0 0 0 .3 1.9l.1.1v3l-.2.1a1.7 1.7 0 0 0-1.1 1.6v.2'],
  search: ['m20 20-4-4', 'M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  plus: ['M12 5v14M5 12h14'],
  chevron: ['m9 18 6-6-6-6'],
  close: ['M18 6 6 18M6 6l12 12'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  dots: ['M5 12h.01M12 12h.01M19 12h.01'],
  calendar: ['M8 2v4M16 2v4M3 9h18', 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z'],
  spark: ['m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z', 'm19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z'],
};
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path v-for="(d,index) in paths[name] || paths.grid" :key="index" :d="d"/></svg></template>
