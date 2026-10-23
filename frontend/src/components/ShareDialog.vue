<script setup lang="ts">
import { ref, watch } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NSpace, NSwitch, useMessage } from 'naive-ui'
import { api, errorMessage, type ShareRow } from '../lib/api'
import { absUrl, copyText } from '../lib/format'

const props = defineProps<{ show: boolean; target: { type: 'file' | 'folder'; id: number; name: string } | null }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'created'): void }>()
const message = useMessage()
const days = ref(7)
const usePassword = ref(true)
const password = ref('')
const maxDownloads = ref<number | null>(null)
const busy = ref(false)
const error = ref('')
const created = ref<ShareRow | null>(null)

const randomCode = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => 'abcdefghjkmnpqrstuvwxyz23456789'[n % 31]).join('')
watch(() => props.show, (v) => { if (v) { created.value = null; error.value = ''; password.value = randomCode() } })

const dayOptions = [{ label: '1 天', value: 1 }, { label: '7 天', value: 7 }, { label: '30 天', value: 30 }, { label: '永久有效', value: 0 }]
const link = () => created.value ? absUrl(`/s/${created.value.token}`) : ''
const fullText = () => created.value ? `${link()}${created.value.password ? `\n提取码：${created.value.password}` : ''}` : ''

async function create() {
  if (!props.target) return
  busy.value = true
  error.value = ''
  try {
    created.value = await api.createShare({
      [props.target.type === 'file' ? 'file_id' : 'folder_id']: props.target.id,
      password: usePassword.value ? password.value : '',
      expires_days: days.value,
      max_downloads: maxDownloads.value || 0,
    })
    emit('created')
  } catch (e) { error.value = errorMessage(e) } finally { busy.value = false }
}
async function copy(text: string) { message[(await copyText(text)) ? 'success' : 'error']('已复制到剪贴板') }
</script>

<template>
  <NModal :show="show" preset="card" :title="`分享「${target?.name ?? ''}」`" style="width: min(480px, 94vw)" @update:show="emit('update:show', $event)">
    <template v-if="!created">
      <NForm label-placement="left" label-width="90">
        <NFormItem label="有效期"><NSelect v-model:value="days" :options="dayOptions" /></NFormItem>
        <NFormItem label="提取码">
          <NSpace align="center" :wrap="false" style="width: 100%">
            <NSwitch v-model:value="usePassword" />
            <NInput v-if="usePassword" v-model:value="password" maxlength="32" placeholder="字母或数字" style="width: 160px" />
          </NSpace>
        </NFormItem>
        <NFormItem label="下载次数"><NInputNumber v-model:value="maxDownloads" :min="0" placeholder="不限" clearable style="width: 100%" /></NFormItem>
      </NForm>
      <NAlert v-if="error" type="error" style="margin-bottom: 12px">{{ error }}</NAlert>
      <NButton type="primary" block :loading="busy" @click="create">创建分享链接</NButton>
    </template>
    <template v-else>
      <NAlert type="success" title="分享链接已创建" style="margin-bottom: 14px" />
      <NInput :value="fullText()" type="textarea" readonly :autosize="{ minRows: 2 }" />
      <NSpace style="margin-top: 14px" justify="end">
        <NButton @click="copy(link())">仅复制链接</NButton>
        <NButton type="primary" @click="copy(fullText())">复制链接和提取码</NButton>
      </NSpace>
    </template>
  </NModal>
</template>
