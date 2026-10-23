<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NAlert, NBreadcrumb, NBreadcrumbItem, NIcon, NSkeleton } from 'naive-ui'
import { FolderOpenOutline } from '@vicons/ionicons5'
import FileList from '../components/FileList.vue'
import { api, errorMessage, type Crumb, type PublicFile } from '../lib/api'
import { formatBytes } from '../lib/format'

const route = useRoute()
const loading = ref(true)
const error = ref('')
const folder = ref<{ id: number; name: string; description: string } | null>(null)
const crumbs = ref<Crumb[]>([])
const subfolders = ref<{ id: number; name: string; description: string; files: number }[]>([])
const files = ref<PublicFile[]>([])

async function load() {
  loading.value = true
  error.value = ''
  try {
    const r = await api.publicFolder(Number(route.params.id))
    folder.value = r.folder
    crumbs.value = r.breadcrumbs
    subfolders.value = r.folders
    files.value = r.files
    document.title = r.folder.name
  } catch (e) { error.value = errorMessage(e) } finally { loading.value = false }
}
watch(() => route.params.id, () => route.name === 'folder' && load(), { immediate: true })
</script>

<template>
  <div class="container page">
    <NBreadcrumb style="margin-bottom: 14px">
      <NBreadcrumbItem><RouterLink to="/">文件中心</RouterLink></NBreadcrumbItem>
      <NBreadcrumbItem v-for="c in crumbs" :key="c.id"><RouterLink :to="`/folder/${c.id}`">{{ c.name }}</RouterLink></NBreadcrumbItem>
    </NBreadcrumb>
    <NAlert v-if="error" type="error">{{ error }}</NAlert>
    <template v-else>
      <div class="head">
        <h2>{{ folder?.name }}</h2>
        <span v-if="!loading" class="muted small">{{ files.length }} 个文件 · {{ formatBytes(files.reduce((s, f) => s + f.size, 0)) }}</span>
      </div>
      <p v-if="folder?.description" class="desc">{{ folder.description }}</p>
      <div v-if="subfolders.length" class="grid" style="margin-bottom: 18px">
        <RouterLink v-for="f in subfolders" :key="f.id" :to="`/folder/${f.id}`" class="sub">
          <div class="folder-badge"><NIcon :size="20"><FolderOpenOutline /></NIcon></div>
          <div style="min-width: 0"><div class="truncate" style="font-weight: 600">{{ f.name }}</div><div class="muted small">{{ f.files }} 个文件</div></div>
        </RouterLink>
      </div>
      <NSkeleton v-if="loading" text :repeat="5" />
      <FileList v-else :files="files" empty-text="该文件夹暂无文件" />
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.head h2 { margin: 0; font-size: 22px; }
.desc { margin: 0 0 16px; color: #475467; white-space: pre-wrap; }
.sub { display: flex; gap: 12px; align-items: center; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.sub:hover { box-shadow: 0 6px 18px rgba(28, 39, 64, .07); }
</style>
