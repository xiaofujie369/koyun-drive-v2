<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NAlert, NBreadcrumb, NBreadcrumbItem, NButton, NCard, NIcon, NInput, NSkeleton } from 'naive-ui'
import { FolderOpenOutline, LockClosedOutline } from '@vicons/ionicons5'
import FileList from '../components/FileList.vue'
import { api, errorMessage, type PublicFolderPage } from '../lib/api'
import { formatBytes } from '../lib/format'

const route = useRoute()
const loading = ref(true)
const error = ref('')
const page = ref<PublicFolderPage | null>(null)
const password = ref('')
const unlocking = ref(false)
const unlockError = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    page.value = await api.publicFolder(Number(route.params.id))
    document.title = page.value.folder.name
  } catch (e) { error.value = errorMessage(e) } finally { loading.value = false }
}

async function unlock() {
  if (!password.value.trim()) return
  unlocking.value = true
  unlockError.value = ''
  try {
    await api.unlockFolder(Number(route.params.id), password.value.trim())
    password.value = ''
    await load() // may reveal a further password on a nested folder
  } catch (e) { unlockError.value = errorMessage(e) } finally { unlocking.value = false }
}

watch(() => route.params.id, () => { if (route.name === 'folder') { unlockError.value = ''; load() } }, { immediate: true })
</script>

<template>
  <div class="container page">
    <NBreadcrumb style="margin-bottom: 14px">
      <NBreadcrumbItem><RouterLink to="/">文件中心</RouterLink></NBreadcrumbItem>
      <NBreadcrumbItem v-for="c in page?.breadcrumbs ?? []" :key="c.id"><RouterLink :to="`/folder/${c.id}`">{{ c.name }}</RouterLink></NBreadcrumbItem>
    </NBreadcrumb>
    <NAlert v-if="error" type="error">{{ error }}</NAlert>
    <NSkeleton v-else-if="loading && !page" text :repeat="5" />
    <NCard v-else-if="page?.locked" class="lock" :bordered="false">
      <div style="text-align: center">
        <div class="lock-icon"><NIcon :size="30"><LockClosedOutline /></NIcon></div>
        <h3 style="margin: 12px 0 4px">{{ page.folder.name }}</h3>
        <p class="muted small">
          <template v-if="page.lock?.is_self">该文件夹需要访问密码</template>
          <template v-else>上级文件夹「{{ page.lock?.name }}」需要访问密码</template>
        </p>
      </div>
      <form style="display: flex; gap: 8px; margin-top: 16px" @submit.prevent="unlock">
        <NInput v-model:value="password" type="password" show-password-on="click" placeholder="访问密码" maxlength="64" autofocus />
        <NButton type="primary" attr-type="submit" :loading="unlocking">进入</NButton>
      </form>
      <NAlert v-if="unlockError" type="error" style="margin-top: 12px">{{ unlockError }}</NAlert>
    </NCard>
    <template v-else-if="page">
      <div class="head">
        <h2>{{ page.folder.name }}</h2>
        <span class="muted small">{{ page.files?.length ?? 0 }} 个文件 · {{ formatBytes((page.files ?? []).reduce((s, f) => s + f.size, 0)) }}</span>
      </div>
      <p v-if="page.folder.description" class="desc">{{ page.folder.description }}</p>
      <div v-if="page.folders?.length" class="grid" style="margin-bottom: 18px">
        <RouterLink v-for="f in page.folders" :key="f.id" :to="`/folder/${f.id}`" class="sub">
          <div class="folder-badge"><NIcon :size="20"><FolderOpenOutline /></NIcon></div>
          <div style="min-width: 0">
            <div class="truncate" style="font-weight: 600">{{ f.name }}<NIcon v-if="f.locked" class="sub-lock" title="需要访问密码"><LockClosedOutline /></NIcon></div>
            <div class="muted small">{{ f.locked ? '需要访问密码' : `${f.files} 个文件` }}</div>
          </div>
        </RouterLink>
      </div>
      <FileList :files="page.files ?? []" empty-text="该文件夹暂无文件" />
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.head h2 { margin: 0; font-size: 22px; }
.desc { margin: 0 0 16px; color: #475467; white-space: pre-wrap; }
.sub { display: flex; gap: 12px; align-items: center; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.sub:hover { box-shadow: 0 6px 18px rgba(28, 39, 64, .07); }
.sub-lock { margin-left: 6px; color: #c58b00; vertical-align: -2px; }
.lock { max-width: 420px; margin: 40px auto; border-radius: 14px; box-shadow: 0 12px 32px rgba(28, 39, 64, .08); }
.lock-icon { width: 60px; height: 60px; margin: 0 auto; border-radius: 50%; background: #fff4d6; color: #c58b00; display: flex; align-items: center; justify-content: center; }
</style>
