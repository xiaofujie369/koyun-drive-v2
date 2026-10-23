<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NModal, NSpin, NTree, useMessage } from 'naive-ui'
import type { TreeOption } from 'naive-ui'
import { api, errorMessage, type TreeFolder } from '../lib/api'

const props = defineProps<{ show: boolean; title?: string; exclude?: number[] }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'pick', id: number | null): void }>()
const message = useMessage()
const folders = ref<TreeFolder[]>([])
const loading = ref(false)
const selected = ref<(string | number)[]>(['root'])

watch(() => props.show, async (v) => {
  if (!v) return
  loading.value = true
  selected.value = ['root']
  try { folders.value = await api.tree() } catch (e) { message.error(errorMessage(e)) } finally { loading.value = false }
})

const options = computed<TreeOption[]>(() => {
  const banned = new Set(props.exclude ?? [])
  const build = (parent: number | null): TreeOption[] => folders.value
    .filter((f) => f.parent_id === parent && !banned.has(f.id))
    .map((f) => {
      const children = build(f.id)
      return { key: f.id, label: f.name, children: children.length ? children : undefined }
    })
  return [{ key: 'root', label: '我的网盘（根目录）', children: build(null) }]
})

function confirm() {
  const k = selected.value[0]
  emit('pick', k === 'root' || k === undefined ? null : Number(k))
  emit('update:show', false)
}
</script>

<template>
  <NModal :show="show" preset="card" :title="title || '选择目标文件夹'" style="width: min(460px, 94vw)" @update:show="emit('update:show', $event)">
    <NSpin :show="loading">
      <div style="max-height: 50vh; overflow: auto; min-height: 120px">
        <NTree v-model:selected-keys="selected" :data="options" block-line default-expand-all selectable />
      </div>
    </NSpin>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" @click="confirm">确定</NButton>
      </div>
    </template>
  </NModal>
</template>
