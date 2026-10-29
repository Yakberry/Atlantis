<script setup>
import { computed, getCurrentInstance } from 'vue'

const props = defineProps({
  src:   { type: String, required: true }, // data:image/svg+xml,...
  color: { type: String, default: '#808080' },
})

// Vue 3.5+: const uid = useId()
const uid = getCurrentInstance().uid

function decodeDataUri(uri) {
  const comma = uri.indexOf(',')
  if (comma === -1) return uri                 // уже не data-URI — отдаём как есть
  const meta    = uri.slice(5, comma)          // 'image/svg+xml;charset=utf-8' / '...;base64'
  const payload = uri.slice(comma + 1)

  if (/;base64/i.test(meta)) {
    // atob даёт «binary string», UTF-8 кириллица в <title> испортится → TextDecoder
    const bin   = atob(payload)
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  }
  // %3csvg%20… → <svg …
  return decodeURIComponent(payload)
}

const html = computed(() => {
  const text = decodeDataUri(props.src)
  const doc  = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg  = doc.documentElement

  // 1) Базовая заливка → currentColor (её и задаёт :style="{ color }")
  svg.querySelectorAll('.player-fill').forEach(el => {
    el.setAttribute('fill', 'currentColor')
  })

  // 2) Уникальные id — иначе у всех юнитов на карте один и тот же filter id
  const suffix = `-${uid}`
  const attrs  = ['filter', 'clip-path', 'mask',
    'marker-start', 'marker-mid', 'marker-end']
  svg.querySelectorAll('[id]').forEach(el => {
    const oldId = el.id
    const newId = oldId + suffix
    el.id = newId
    attrs.forEach(attr => {
      svg.querySelectorAll(`[${attr}*="${oldId}"]`).forEach(node => {
        const v = node.getAttribute(attr)
        if (v) node.setAttribute(attr, v.replace(oldId, newId))
      })
    })
  })

  return svg.outerHTML
})
</script>

<template>
  <div class="unit-icon" :style="{ color }" v-html="html" />
</template>

<style scoped>
.unit-icon {
  display: block;
  width: 26px;
  height: 26px;
}

.unit-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
