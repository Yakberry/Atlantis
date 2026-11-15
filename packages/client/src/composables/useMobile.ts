import { onBeforeUnmount, onMounted, ref } from 'vue';

/** Узкий экран или телефон в альбомной ориентации. Должен совпадать с медиазапросом мобильных стилей в styles.css. */
export const MOBILE_QUERY = '(max-width: 720px), (pointer: coarse) and (max-height: 520px)';

export function useMobile() {
  const query = window.matchMedia(MOBILE_QUERY);
  const mobile = ref(query.matches);
  const update = () => (mobile.value = query.matches);
  onMounted(() => query.addEventListener('change', update));
  onBeforeUnmount(() => query.removeEventListener('change', update));
  return mobile;
}
