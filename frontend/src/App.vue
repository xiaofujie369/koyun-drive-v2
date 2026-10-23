<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NConfigProvider, NMessageProvider, NDialogProvider, NLoadingBarProvider, NSpin, zhCN, dateZhCN, type GlobalThemeOverrides } from 'naive-ui'
import AppShell from './components/AppShell.vue'
import { loadConfig, store } from './lib/store'
import { router } from './router'

const theme: GlobalThemeOverrides = {
  common: {
    primaryColor: '#16845b', primaryColorHover: '#1c9a6b', primaryColorPressed: '#0f6b49', primaryColorSuppl: '#1c9a6b',
    borderRadius: '8px',
  },
}
const ready = computed(() => store.ready)

onMounted(async () => {
  await loadConfig()
  const route = router.currentRoute.value
  if (route.meta.auth && !store.user) router.replace({ name: 'login', query: { redirect: route.fullPath } })
})
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="theme">
    <NLoadingBarProvider>
      <NMessageProvider>
        <NDialogProvider>
          <AppShell v-if="ready" />
          <div v-else style="height: 100vh; display: flex; align-items: center; justify-content: center"><NSpin /></div>
        </NDialogProvider>
      </NMessageProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>
