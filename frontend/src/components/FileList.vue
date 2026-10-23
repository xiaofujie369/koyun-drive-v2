<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NEmpty, NIcon, NModal, NTooltip, useMessage } from 'naive-ui'
import { CloudDownloadOutline, LinkOutline, EyeOutline } from '@vicons/ionicons5'
import { RouterLink } from 'vue-router'
import { absUrl, copyText, fileKind, formatBytes, formatDate } from '../lib/format'

export interface ListFile {
  id: number; name: string; size: number; mime_type: string; note: string; created_at: string
  url: string; preview_url?: string | null; preview?: boolean; downloads?: number; folder?: { id: number; name: string }
}

defineProps<{ files: ListFile[]; showFolder?: boolean; emptyText?: string }>()
const message = useMessage()
const previewing = ref<ListFile | null>(null)

const previewSrc = (f: ListFile) => f.preview_url ?? (f.preview ? `${f.url}${f.url.includes('?') ? '&' : '?'}preview=1` : null)
const kind = (f: ListFile) => (f.mime_type.startsWith('image/') ? 'image' : f.mime_type.startsWith('video/') ? 'video' : f.mime_type.startsWith('audio/') ? 'audio' : '')

async function copy(f: ListFile) {
  message[(await copyText(absUrl(f.url))) ? 'success' : 'error']('下载链接已复制')
}
</script>

<template>
  <div v-if="files.length" class="list">
    <div v-for="f in files" :key="f.id" class="row">
      <div class="file-badge" :style="{ background: fileKind(f.name).color }">{{ fileKind(f.name).ext }}</div>
      <div class="info">
        <div class="name">{{ f.name }}</div>
        <div class="meta muted small">
          <span>{{ formatBytes(f.size) }}</span>
          <span class="hide-sm">{{ formatDate(f.created_at) }}</span>
          <span v-if="f.downloads !== undefined">下载 {{ f.downloads }} 次</span>
          <RouterLink v-if="showFolder && f.folder" :to="`/folder/${f.folder.id}`" class="folder-link">📁 {{ f.folder.name }}</RouterLink>
        </div>
        <div v-if="f.note" class="note small">{{ f.note }}</div>
      </div>
      <div class="actions">
        <NTooltip v-if="previewSrc(f) && kind(f)">
          <template #trigger>
            <NButton quaternary circle class="hide-sm" @click="previewing = f"><template #icon><NIcon><EyeOutline /></NIcon></template></NButton>
          </template>预览
        </NTooltip>
        <NTooltip>
          <template #trigger>
            <NButton quaternary circle @click="copy(f)"><template #icon><NIcon><LinkOutline /></NIcon></template></NButton>
          </template>复制下载链接
        </NTooltip>
        <a :href="f.url" rel="nofollow">
          <NButton type="primary" size="small"><template #icon><NIcon><CloudDownloadOutline /></NIcon></template>下载</NButton>
        </a>
      </div>
    </div>
  </div>
  <NEmpty v-else :description="emptyText || '暂无文件'" style="padding: 48px 0" />

  <NModal :show="!!previewing" preset="card" :title="previewing?.name" style="width: min(960px, 96vw)" @update:show="previewing = null">
    <div v-if="previewing" class="preview">
      <img v-if="kind(previewing) === 'image'" :src="previewSrc(previewing)!" :alt="previewing.name" />
      <video v-else-if="kind(previewing) === 'video'" :src="previewSrc(previewing)!" controls autoplay />
      <audio v-else-if="kind(previewing) === 'audio'" :src="previewSrc(previewing)!" controls autoplay />
    </div>
  </NModal>
</template>

<style scoped>
.list { background: #fff; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-top: 1px solid var(--line); }
.row:first-child { border-top: 0; }
.row:hover { background: #fafbfc; }
.info { flex: 1; min-width: 0; }
.name { font-weight: 600; word-break: break-all; line-height: 1.4; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 3px; }
.note { margin-top: 4px; color: #475467; white-space: pre-wrap; }
.folder-link { color: var(--brand); }
.actions { display: flex; align-items: center; gap: 4px; flex: none; }
.preview { display: flex; justify-content: center; }
.preview img, .preview video { max-width: 100%; max-height: 75vh; border-radius: 8px; }
.preview audio { width: 100%; }
@media (max-width: 640px) { .row { flex-wrap: wrap; } .actions { width: 100%; justify-content: flex-end; } }
</style>
