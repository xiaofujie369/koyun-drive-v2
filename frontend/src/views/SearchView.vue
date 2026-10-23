<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NIcon, NInput, NSkeleton } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import FileList from '../components/FileList.vue'
import { api, errorMessage, type PublicFile } from '../lib/api'

const route = useRoute()
const router = useRouter()
const q = ref(String(route.query.q || ''))
const files = ref<PublicFile[]>([])
const loading = ref(false)
const error = ref('')

watch(() => route.query.q, async (v) => {
  q.value = String(v || '')
  if (!q.value) { files.value = []; return }
  loading.value = true
  error.value = ''
  try { files.value = (await api.search(q.value)).files } catch (e) { error.value = errorMessage(e) } finally { loading.value = false }
}, { immediate: true })
</script>

<template>
  <div class="container page">
    <form style="max-width: 560px; margin-bottom: 18px" @submit.prevent="q.trim() && router.push({ name: 'search', query: { q: q.trim() } })">
      <NInput v-model:value="q" size="large" placeholder="搜索文件名或备注" clearable>
        <template #prefix><NIcon><SearchOutline /></NIcon></template>
        <template #suffix><NButton text type="primary" attr-type="submit">搜索</NButton></template>
      </NInput>
    </form>
    <NAlert v-if="error" type="error">{{ error }}</NAlert>
    <NSkeleton v-else-if="loading" text :repeat="5" />
    <template v-else-if="route.query.q">
      <p class="muted small">找到 {{ files.length }} 个与「{{ route.query.q }}」相关的文件</p>
      <FileList :files="files" show-folder empty-text="没有找到相关文件" />
    </template>
  </div>
</template>
