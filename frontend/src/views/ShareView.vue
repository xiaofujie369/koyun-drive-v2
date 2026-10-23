<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NAlert, NBreadcrumb, NBreadcrumbItem, NButton, NCard, NIcon, NInput, NSkeleton, NResult } from 'naive-ui'
import { FolderOpenOutline, LockClosedOutline } from '@vicons/ionicons5'
import FileList from '../components/FileList.vue'
import { api, errorMessage, type Crumb, type ShareFile, type ShareInfo } from '../lib/api'
import { formatDate } from '../lib/format'

const route = useRoute()
const token = String(route.params.token)
const info = ref<ShareInfo | null>(null)
const loading = ref(true)
const error = ref('')
const status = ref(404)
const password = ref(String(route.query.pwd || ''))
const unlocking = ref(false)
const unlockError = ref('')
const crumbs = ref<Crumb[]>([])
const folders = ref<{ id: number; name: string }[]>([])
const files = ref<ShareFile[]>([])
const browsing = ref(false)

async function load() {
  loading.value = true
  try {
    info.value = await api.share(token)
    document.title = `${info.value.name} - 分享`
    if (info.value.locked && password.value) await unlock()
    else if (!info.value.locked && info.value.type === 'folder') await browse()
  } catch (e) {
    error.value = errorMessage(e)
    status.value = (e as { response?: { status: number } }).response?.status ?? 500
  } finally { loading.value = false }
}

async function unlock() {
  unlocking.value = true
  unlockError.value = ''
  try {
    await api.unlockShare(token, password.value)
    info.value = await api.share(token)
    if (info.value.type === 'folder') await browse()
  } catch (e) { unlockError.value = errorMessage(e) } finally { unlocking.value = false }
}

async function browse(folderId?: number) {
  browsing.value = true
  try {
    const r = await api.browseShare(token, folderId)
    crumbs.value = r.breadcrumbs
    folders.value = r.folders
    files.value = r.files
  } catch (e) { error.value = errorMessage(e) } finally { browsing.value = false }
}
onMounted(load)
</script>

<template>
  <div class="container page" style="max-width: 900px">
    <NSkeleton v-if="loading" text :repeat="4" />
    <NResult v-else-if="error && !info" :status="status === 410 ? 'warning' : '404'" :title="error" description="请联系分享者获取新的链接">
      <template #footer><RouterLink to="/"><NButton>返回首页</NButton></RouterLink></template>
    </NResult>
    <template v-else-if="info">
      <NCard v-if="info.locked" class="lock" :bordered="false">
        <div style="text-align: center">
          <div class="lock-icon"><NIcon :size="30"><LockClosedOutline /></NIcon></div>
          <h3 style="margin: 12px 0 4px">{{ info.name }}</h3>
          <p class="muted small">{{ info.owner }} 分享于 {{ formatDate(info.created_at) }}，请输入提取码</p>
        </div>
        <form style="display: flex; gap: 8px; margin-top: 16px" @submit.prevent="unlock">
          <NInput v-model:value="password" placeholder="提取码" maxlength="32" autofocus />
          <NButton type="primary" attr-type="submit" :loading="unlocking">提取文件</NButton>
        </form>
        <NAlert v-if="unlockError" type="error" style="margin-top: 12px">{{ unlockError }}</NAlert>
      </NCard>
      <template v-else>
        <div class="head">
          <h2>{{ info.name }}</h2>
          <span class="muted small">{{ info.owner }} 分享于 {{ formatDate(info.created_at) }}<template v-if="info.expires_at"> · {{ formatDate(info.expires_at) }} 过期</template></span>
        </div>
        <FileList v-if="info.file" :files="[info.file]" />
        <template v-else>
          <NBreadcrumb v-if="crumbs.length > 1" style="margin-bottom: 12px">
            <NBreadcrumbItem v-for="c in crumbs" :key="c.id" @click="browse(c.id)">{{ c.name }}</NBreadcrumbItem>
          </NBreadcrumb>
          <div v-if="folders.length" class="grid" style="margin-bottom: 14px">
            <a v-for="f in folders" :key="f.id" class="sub" href="#" @click.prevent="browse(f.id)">
              <div class="folder-badge"><NIcon :size="20"><FolderOpenOutline /></NIcon></div>
              <span class="truncate" style="font-weight: 600">{{ f.name }}</span>
            </a>
          </div>
          <NSkeleton v-if="browsing" text :repeat="4" />
          <FileList v-else :files="files" empty-text="该文件夹为空" />
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.lock { max-width: 420px; margin: 40px auto; border-radius: 14px; box-shadow: 0 12px 32px rgba(28, 39, 64, .08); }
.lock-icon { width: 60px; height: 60px; margin: 0 auto; border-radius: 50%; background: #eaf7f0; color: var(--brand); display: flex; align-items: center; justify-content: center; }
.head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.head h2 { margin: 0; font-size: 21px; word-break: break-all; }
.sub { display: flex; gap: 12px; align-items: center; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
</style>
