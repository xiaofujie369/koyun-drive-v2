<script setup lang="ts">
import { computed, h } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { NButton, NDropdown, NIcon, NProgress, useMessage } from 'naive-ui'
import { CloudOutline, LogOutOutline, PersonCircleOutline, SettingsOutline, AppsOutline } from '@vicons/ionicons5'
import { api, errorMessage } from '../lib/api'
import { store } from '../lib/store'
import { formatBytes } from '../lib/format'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const site = computed(() => store.config?.site_name || 'Koyun Drive')
const usage = computed(() => (store.user && store.user.quota ? Math.min(100, (store.user.used / store.user.quota) * 100) : 0))

const icon = (c: unknown) => () => h(NIcon, null, { default: () => h(c as never) })
const menu = computed(() => [
  { key: 'drive', label: '我的网盘', icon: icon(CloudOutline) },
  { key: 'account', label: '账号设置', icon: icon(SettingsOutline) },
  ...(store.user?.is_admin ? [{ key: 'admin', label: '管理后台', icon: icon(AppsOutline) }] : []),
  { type: 'divider', key: 'd1' },
  { key: 'logout', label: '退出登录', icon: icon(LogOutOutline) },
])

async function onMenu(key: string) {
  if (key === 'drive') router.push('/drive')
  else if (key === 'account') router.push({ path: '/drive', query: { tab: 'account' } })
  else if (key === 'admin') location.href = '/admin/'
  else if (key === 'logout') {
    try {
      await api.logout()
      store.user = null
      message.success('已退出登录')
      if (route.meta.auth) router.push('/')
    } catch (e) { message.error(errorMessage(e)) }
  }
}
</script>

<template>
  <header class="topbar">
    <div class="container bar">
      <RouterLink to="/" class="brand">
        <span class="mark">K</span><span class="truncate">{{ site }}</span>
      </RouterLink>
      <nav class="nav">
        <RouterLink to="/" class="link" :class="{ active: route.name === 'home' || route.name === 'folder' || route.name === 'search' }">文件中心</RouterLink>
        <RouterLink v-if="store.user" to="/drive" class="link" :class="{ active: route.name === 'drive' }">我的网盘</RouterLink>
        <NDropdown v-if="store.user" :options="menu" trigger="click" @select="onMenu">
          <NButton quaternary circle><template #icon><NIcon :size="24"><PersonCircleOutline /></NIcon></template></NButton>
        </NDropdown>
        <RouterLink v-else :to="{ name: 'login', query: { redirect: route.fullPath } }"><NButton type="primary" size="small">登录</NButton></RouterLink>
      </nav>
    </div>
    <NProgress v-if="store.user && store.user.quota && route.name === 'drive'" type="line" :percentage="usage" :show-indicator="false" :height="2" :border-radius="0"
      :status="usage > 90 ? 'error' : 'success'" :title="`已用 ${formatBytes(store.user.used)} / ${formatBytes(store.user.quota)}`" />
  </header>
  <main><RouterView /></main>
  <footer class="footer container muted small">© {{ new Date().getFullYear() }} {{ site }}</footer>
</template>

<style scoped>
.topbar { position: sticky; top: 0; z-index: 20; background: rgba(255,255,255,.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
.bar { display: flex; align-items: center; justify-content: space-between; height: 60px; gap: 12px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 17px; min-width: 0; }
.mark { flex: none; width: 32px; height: 32px; border-radius: 9px; background: var(--brand); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; }
.nav { display: flex; align-items: center; gap: 4px; }
.link { padding: 6px 12px; border-radius: 8px; color: var(--muted); font-size: 14px; white-space: nowrap; }
.link:hover { background: #f0f3f7; color: #172033; }
.link.active { color: var(--brand); font-weight: 600; }
.footer { padding: 24px 16px 32px; text-align: center; }
@media (max-width: 480px) { .link { padding: 6px 8px; } }
</style>
