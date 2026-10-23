<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NButtonGroup, NIcon, NModal, NSpace, useMessage } from 'naive-ui'
import { ArrowDownOutline, ArrowUpOutline, ReorderFourOutline, PlayForwardOutline } from '@vicons/ionicons5'
import { api, errorMessage } from '../lib/api'
import { formatBytes } from '../lib/format'

interface Item { id: number; name: string; size?: number; created_at?: string }
const props = defineProps<{ show: boolean; folders: Item[]; files: Item[]; title?: string }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'saved'): void }>()
const message = useMessage()
const lists = ref<{ folders: Item[]; files: Item[] }>({ folders: [], files: [] })
const dragging = ref<{ kind: 'folders' | 'files'; index: number } | null>(null)
const saving = ref(false)

watch(() => props.show, (v) => { if (v) lists.value = { folders: [...props.folders], files: [...props.files] } })

function move(kind: 'folders' | 'files', from: number, to: number) {
  const arr = lists.value[kind]
  if (to < 0 || to >= arr.length || from === to) return
  const [it] = arr.splice(from, 1)
  arr.splice(to, 0, it)
}
function onDragOver(kind: 'folders' | 'files', index: number) {
  const d = dragging.value
  if (!d || d.kind !== kind || d.index === index) return
  move(kind, d.index, index)
  d.index = index
}
const cmp = {
  name: (a: Item, b: Item) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }),
  time: (a: Item, b: Item) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  size: (a: Item, b: Item) => (b.size ?? 0) - (a.size ?? 0),
}
function sortAll(by: keyof typeof cmp) {
  lists.value.folders.sort(by === 'size' ? cmp.name : cmp[by])
  lists.value.files.sort(cmp[by])
}

async function save() {
  saving.value = true
  try {
    await api.reorder({ folder_ids: lists.value.folders.map((f) => f.id), file_ids: lists.value.files.map((f) => f.id) })
    message.success('顺序已保存')
    emit('saved')
    emit('update:show', false)
  } catch (e) { message.error(errorMessage(e)) } finally { saving.value = false }
}
</script>

<template>
  <NModal :show="show" preset="card" :title="title || '调整顺序'" style="width: min(560px, 96vw)" @update:show="emit('update:show', $event)">
    <div class="tip muted small">拖动 <NIcon><ReorderFourOutline /></NIcon> 或用箭头调整顺序，保存后访客看到的顺序也会同步更新。</div>
    <NSpace align="center" :size="8" style="margin-bottom: 12px">
      <span class="small muted">快速排序：</span>
      <NButtonGroup size="small">
        <NButton @click="sortAll('name')">按名称</NButton>
        <NButton @click="sortAll('time')">最新在前</NButton>
        <NButton @click="sortAll('size')">最大在前</NButton>
      </NButtonGroup>
    </NSpace>
    <div class="lists">
      <template v-for="kind in (['folders', 'files'] as const)" :key="kind">
        <div v-if="lists[kind].length" class="group-title small">{{ kind === 'folders' ? '文件夹' : '文件' }}（{{ lists[kind].length }}）</div>
        <div
          v-for="(it, i) in lists[kind]" :key="it.id" class="row" :class="{ dragging: dragging?.kind === kind && dragging.index === i }"
          draggable="true" @dragstart="dragging = { kind, index: i }" @dragend="dragging = null" @dragover.prevent="onDragOver(kind, i)" @drop.prevent
        >
          <NIcon class="handle" :size="18"><ReorderFourOutline /></NIcon>
          <span class="idx">{{ i + 1 }}</span>
          <span class="name truncate">{{ kind === 'folders' ? '📁 ' : '' }}{{ it.name }}</span>
          <span v-if="kind === 'files'" class="muted small hide-sm">{{ formatBytes(it.size ?? 0) }}</span>
          <NButton quaternary circle size="tiny" title="置顶" :disabled="i === 0" @click="move(kind, i, 0)"><template #icon><NIcon style="transform: rotate(-90deg)"><PlayForwardOutline /></NIcon></template></NButton>
          <NButton quaternary circle size="tiny" title="上移" :disabled="i === 0" @click="move(kind, i, i - 1)"><template #icon><NIcon><ArrowUpOutline /></NIcon></template></NButton>
          <NButton quaternary circle size="tiny" title="下移" :disabled="i === lists[kind].length - 1" @click="move(kind, i, i + 1)"><template #icon><NIcon><ArrowDownOutline /></NIcon></template></NButton>
        </div>
      </template>
      <div v-if="!lists.folders.length && !lists.files.length" class="muted small" style="padding: 24px; text-align: center">这里没有可排序的内容</div>
    </div>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" :loading="saving" @click="save">保存顺序</NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped>
.tip { margin-bottom: 10px; display: flex; align-items: center; gap: 4px; }
.lists { max-height: 55vh; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; }
.group-title { padding: 8px 12px; background: #f8fafc; color: var(--muted); font-weight: 600; position: sticky; top: 0; z-index: 1; }
.row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-top: 1px solid var(--line); background: #fff; }
.row.dragging { background: #eaf7f0; opacity: .7; }
.handle { cursor: grab; color: #9aa4b2; flex: none; }
.idx { width: 22px; text-align: right; color: #9aa4b2; font-size: 12px; flex: none; }
.name { flex: 1; font-size: 14px; }
</style>
