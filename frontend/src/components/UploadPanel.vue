<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NIcon, NProgress, NTooltip } from 'naive-ui'
import { ChevronDownOutline, ChevronUpOutline, CloseOutline, PauseOutline, PlayOutline, RefreshOutline, CheckmarkCircle, AlertCircle } from '@vicons/ionicons5'
import { uploader, uploadTick } from '../lib/uploads'
import { formatBytes, formatEta } from '../lib/format'
import type { UploadTask } from '../lib/uploader'

const collapsed = ref(false)
const tasks = computed(() => { void uploadTick.value; return uploader.tasks.map((t) => ({ ...t })) })
const totals = computed(() => { void uploadTick.value; return uploader.totals })
const active = computed(() => { void uploadTick.value; return uploader.active })
const pct = (t: UploadTask) => (t.size ? Math.floor((t.loaded / t.size) * 100) : t.status === 'done' ? 100 : 0)
const STATUS: Record<string, string> = { queued: '等待中', preparing: '准备中', uploading: '上传中', paused: '已暂停', completing: '正在保存', done: '已完成', error: '失败', canceled: '已取消' }
const title = computed(() => active.value ? `正在上传 ${active.value} 个文件 · ${formatBytes(totals.value.speed)}/s` : '上传完成')
</script>

<template>
  <div v-if="tasks.length" class="panel">
    <div class="head" @click="collapsed = !collapsed">
      <span class="truncate">{{ title }}</span>
      <div style="display: flex; gap: 2px" @click.stop>
        <NButton v-if="!active" quaternary size="tiny" @click="uploader.clearFinished()">清空</NButton>
        <NButton quaternary circle size="tiny" @click="collapsed = !collapsed"><template #icon><NIcon><ChevronUpOutline v-if="collapsed" /><ChevronDownOutline v-else /></NIcon></template></NButton>
      </div>
    </div>
    <NProgress v-if="active" type="line" :percentage="totals.size ? Math.floor((totals.loaded / totals.size) * 100) : 0" :show-indicator="false" :height="3" :border-radius="0" />
    <div v-show="!collapsed" class="body">
      <div v-for="t in tasks" :key="t.id" class="task">
        <div class="row1">
          <span class="name truncate" :title="t.name">{{ t.name }}</span>
          <NIcon v-if="t.status === 'done'" color="#16845b" :size="18"><CheckmarkCircle /></NIcon>
          <NIcon v-else-if="t.status === 'error'" color="#d03050" :size="18"><AlertCircle /></NIcon>
          <template v-if="!['done', 'canceled'].includes(t.status)">
            <NTooltip v-if="['uploading', 'queued', 'preparing'].includes(t.status)"><template #trigger><NButton quaternary circle size="tiny" @click="uploader.pause(t.id)"><template #icon><NIcon><PauseOutline /></NIcon></template></NButton></template>暂停</NTooltip>
            <NTooltip v-if="t.status === 'paused'"><template #trigger><NButton quaternary circle size="tiny" @click="uploader.resume(t.id)"><template #icon><NIcon><PlayOutline /></NIcon></template></NButton></template>继续</NTooltip>
            <NTooltip v-if="t.status === 'error'"><template #trigger><NButton quaternary circle size="tiny" @click="uploader.retry(t.id)"><template #icon><NIcon><RefreshOutline /></NIcon></template></NButton></template>重试（断点续传）</NTooltip>
            <NTooltip v-if="t.status !== 'completing'"><template #trigger><NButton quaternary circle size="tiny" @click="uploader.cancel(t.id)"><template #icon><NIcon><CloseOutline /></NIcon></template></NButton></template>取消</NTooltip>
          </template>
        </div>
        <NProgress v-if="!['done', 'canceled'].includes(t.status)" type="line" :percentage="pct(t)" :height="4" :show-indicator="false" :status="t.status === 'error' ? 'error' : t.status === 'paused' ? 'warning' : 'success'" />
        <div class="meta small">
          <span :class="{ err: t.status === 'error' }">{{ t.status === 'error' ? t.error : STATUS[t.status] }}<template v-if="t.resumed && t.status === 'uploading'">（续传）</template></span>
          <span>
            {{ formatBytes(t.status === 'done' ? t.size : t.loaded) }} / {{ formatBytes(t.size) }}
            <template v-if="t.status === 'uploading' && t.speed"> · {{ formatBytes(t.speed) }}/s · 剩余 {{ formatEta(t.size - t.loaded, t.speed) }}</template>
          </span>
        </div>
        <div v-if="t.folderLabel" class="meta small"><span>→ {{ t.folderLabel }}</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel { position: fixed; right: 16px; bottom: 16px; width: min(420px, calc(100vw - 32px)); background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 16px 40px rgba(28, 39, 64, .16); z-index: 50; overflow: hidden; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px 10px 16px; font-weight: 600; font-size: 14px; cursor: pointer; background: #f8fafc; }
.body { max-height: 46vh; overflow-y: auto; }
.task { padding: 10px 16px; border-top: 1px solid var(--line); }
.row1 { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
.name { flex: 1; font-size: 13px; font-weight: 500; }
.meta { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); margin-top: 4px; }
.err { color: #d03050; }
</style>
