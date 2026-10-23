<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NAlert, NIcon, NInput, NSkeleton, NEmpty, NButton } from 'naive-ui'
import { SearchOutline, FolderOpenOutline } from '@vicons/ionicons5'
import { api, errorMessage, type PublicFolderCard } from '../lib/api'
import { store } from '../lib/store'
import { formatBytes, formatDate } from '../lib/format'

const router = useRouter()
const loading = ref(true)
const error = ref('')
const folders = ref<PublicFolderCard[]>([])
const stats = ref({ folders: 0, files: 0, size: 0, downloads: 0 })
const q = ref('')

onMounted(async () => {
  try {
    const r = await api.home()
    folders.value = r.folders
    stats.value = r.stats
  } catch (e) { error.value = errorMessage(e) } finally { loading.value = false }
})

const search = () => q.value.trim() && router.push({ name: 'search', query: { q: q.value.trim() } })
</script>

<template>
  <section class="hero">
    <div class="container">
      <h1>{{ store.config?.site_name }}</h1>
      <p>{{ store.config?.site_subtitle }}</p>
      <form v-if="store.config?.public_search" class="search" @submit.prevent="search">
        <NInput v-model:value="q" size="large" round placeholder="搜索软件、安装包、资料…" clearable>
          <template #prefix><NIcon><SearchOutline /></NIcon></template>
          <template #suffix><NButton text type="primary" attr-type="submit">搜索</NButton></template>
        </NInput>
      </form>
    </div>
  </section>

  <div class="container page">
    <NAlert v-if="store.config?.announcement" type="info" :show-icon="true" style="margin-bottom: 18px; white-space: pre-wrap">{{ store.config.announcement }}</NAlert>
    <NAlert v-if="error" type="error" style="margin-bottom: 18px">{{ error }}</NAlert>

    <div class="stats">
      <div class="stat"><span>文件夹</span><strong>{{ stats.folders }}</strong></div>
      <div class="stat"><span>文件</span><strong>{{ stats.files }}</strong></div>
      <div class="stat"><span>总大小</span><strong>{{ formatBytes(stats.size) }}</strong></div>
      <div class="stat"><span>累计下载</span><strong>{{ stats.downloads }}</strong></div>
    </div>

    <div class="section-title"><NIcon><FolderOpenOutline /></NIcon>全部分类</div>
    <div v-if="loading" class="grid"><NSkeleton v-for="i in 6" :key="i" height="96px" :sharp="false" /></div>
    <div v-else-if="folders.length" class="grid">
      <RouterLink v-for="f in folders" :key="f.id" :to="`/folder/${f.id}`" class="card">
        <div class="folder-badge"><NIcon :size="22"><FolderOpenOutline /></NIcon></div>
        <div style="min-width: 0">
          <div class="title truncate">{{ f.name }}</div>
          <div class="muted small">{{ f.files }} 个文件 · {{ formatBytes(f.size) }}<template v-if="f.subfolders"> · {{ f.subfolders }} 个子目录</template></div>
          <div v-if="f.description" class="desc small truncate">{{ f.description }}</div>
          <div v-else class="muted small">更新于 {{ formatDate(f.updated_at) }}</div>
        </div>
      </RouterLink>
    </div>
    <NEmpty v-else description="暂无公开文件，管理员上传后会显示在这里" style="padding: 48px 0" />
  </div>
</template>

<style scoped>
.hero { background: linear-gradient(135deg, #0f6b49, #16845b 55%, #1fa36f); color: #fff; padding: 44px 0 52px; }
.hero h1 { margin: 0; font-size: 30px; letter-spacing: .5px; }
.hero p { margin: 8px 0 0; opacity: .85; }
.search { margin-top: 22px; max-width: 560px; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: -48px; }
.stat { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; box-shadow: 0 8px 24px rgba(28, 39, 64, .06); }
.stat span { display: block; font-size: 13px; color: var(--muted); }
.stat strong { display: block; font-size: 22px; margin-top: 4px; }
.card { display: flex; gap: 14px; align-items: center; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 18px; transition: box-shadow .15s, transform .15s; }
.card:hover { box-shadow: 0 10px 26px rgba(28, 39, 64, .09); transform: translateY(-1px); }
.title { font-weight: 600; font-size: 15px; margin-bottom: 3px; }
.desc { color: #475467; margin-top: 2px; }
@media (max-width: 640px) { .stats { grid-template-columns: repeat(2, 1fr); } .hero { padding: 28px 0 56px; } .hero h1 { font-size: 24px; } }
</style>
