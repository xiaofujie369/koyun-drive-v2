<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert, NBreadcrumb, NBreadcrumbItem, NButton, NDataTable, NDropdown, NForm, NFormItem, NIcon, NInput, NModal,
  NPopconfirm, NProgress, NSpace, NTabPane, NTabs, NTag, useDialog, useMessage, type DataTableColumns,
} from 'naive-ui'
import {
  CloudUploadOutline, FolderOpenOutline, AddOutline, RefreshOutline, EllipsisHorizontal, TrashOutline, MoveOutline, SwapVerticalOutline,
} from '@vicons/ionicons5'
import UploadPanel from '../components/UploadPanel.vue'
import FolderPicker from '../components/FolderPicker.vue'
import ShareDialog from '../components/ShareDialog.vue'
import ReorderModal from '../components/ReorderModal.vue'
import { api, errorMessage, type Crumb, type DriveFile, type DriveFolder, type ShareRow } from '../lib/api'
import { store, refreshUser } from '../lib/store'
import { uploader, onUploadDone } from '../lib/uploads'
import { absUrl, copyText, fileKind, formatBytes, formatDate } from '../lib/format'

type Row = { key: string; kind: 'folder'; item: DriveFolder } | { key: string; kind: 'file'; item: DriveFile }

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const tab = ref(String(route.query.tab || 'files'))
const folderId = computed(() => (route.params.folder ? Number(route.params.folder) : null))
const loading = ref(false)
const crumbs = ref<Crumb[]>([])
const current = ref<DriveFolder | null>(null)
const folders = ref<DriveFolder[]>([])
const files = ref<DriveFile[]>([])
const checked = ref<string[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

const rows = computed<Row[]>(() => [
  ...folders.value.map((f) => ({ key: `d${f.id}`, kind: 'folder' as const, item: f })),
  ...files.value.map((f) => ({ key: `f${f.id}`, kind: 'file' as const, item: f })),
])
const canPublish = computed(() => !!(store.user?.is_admin || store.config?.user_public_folders))

async function load() {
  loading.value = true
  try {
    const r = await api.list(folderId.value)
    crumbs.value = r.breadcrumbs
    current.value = r.folder
    folders.value = r.folders
    files.value = r.files
    checked.value = []
  } catch (e) {
    message.error(errorMessage(e))
    if (folderId.value) router.replace('/drive')
  } finally { loading.value = false }
}
watch(folderId, () => route.name === 'drive' && load())
watch(tab, (t) => { router.replace({ query: t === 'files' ? {} : { tab: t } }); if (t === 'shares') loadShares() })

let off: (() => void) | undefined
onMounted(() => {
  load()
  if (tab.value === 'shares') loadShares()
  off = onUploadDone((t) => { if (t.folderId === folderId.value) load() })
})
onBeforeUnmount(() => off?.())

// ------------------------------------------------------------ upload
function pickFiles() { fileInput.value?.click() }
function onFiles(list: FileList | null) {
  if (!list?.length) return
  const max = store.config?.max_file_size ?? 0
  const ok = Array.from(list).filter((f) => {
    if (max && f.size > max) { message.error(`${f.name} 超过单文件上限 ${formatBytes(max)}`); return false }
    return true
  })
  uploader.add(ok, folderId.value, current.value?.name ?? '我的网盘')
  if (fileInput.value) fileInput.value.value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  onFiles(e.dataTransfer?.files ?? null)
}

// ------------------------------------------------------------ actions
const nameModal = ref<{ mode: 'new' | 'rename-folder' | 'rename-file'; id?: number; value: string; note?: string; desc?: string } | null>(null)
const savingName = ref(false)
async function saveName() {
  const m = nameModal.value
  if (!m || !m.value.trim()) return
  savingName.value = true
  try {
    if (m.mode === 'new') await api.createFolder({ name: m.value.trim(), parent_id: folderId.value })
    else if (m.mode === 'rename-folder') await api.updateFolder(m.id!, { name: m.value.trim(), description: m.desc ?? '' })
    else await api.updateFile(m.id!, { name: m.value.trim(), note: m.note ?? '' })
    nameModal.value = null
    message.success('已保存')
    load()
  } catch (e) { message.error(errorMessage(e)) } finally { savingName.value = false }
}

const picker = ref<{ show: boolean; files: number[]; folders: number[] }>({ show: false, files: [], folders: [] })
async function moveTo(target: number | null) {
  try {
    await api.batch({ action: 'move', file_ids: picker.value.files, folder_ids: picker.value.folders, target_id: target })
    message.success('移动成功')
    load()
  } catch (e) { message.error(errorMessage(e)) }
}

const shareTarget = ref<{ type: 'file' | 'folder'; id: number; name: string } | null>(null)
const shareShow = ref(false)
const reorderShow = ref(false)

function confirmDelete(fileIds: number[], folderIds: number[]) {
  const n = fileIds.length + folderIds.length
  dialog.warning({
    title: '确认删除',
    content: folderIds.length ? `将删除 ${n} 个项目，文件夹内的所有文件也会被永久删除，无法恢复。` : `将永久删除 ${n} 个文件，无法恢复。`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.batch({ action: 'delete', file_ids: fileIds, folder_ids: folderIds })
        message.success('已删除')
        load()
        refreshUser()
      } catch (e) { message.error(errorMessage(e)) }
    },
  })
}

async function download(f: DriveFile, preview = false) {
  try {
    const r = await api.fileLink(f.id)
    if (preview && r.preview_url) window.open(r.preview_url, '_blank', 'noopener')
    else location.href = r.url
  } catch (e) { message.error(errorMessage(e)) }
}

async function togglePublic(f: DriveFolder) {
  try {
    await api.updateFolder(f.id, { is_public: !f.is_public })
    f.is_public = !f.is_public
    message.success(f.is_public ? '已公开到文件中心' : '已取消公开')
  } catch (e) { message.error(errorMessage(e)) }
}

async function copyPublicLink(f: DriveFile) {
  message[(await copyText(absUrl(`/d/${f.id}/${encodeURIComponent(f.name)}`))) ? 'success' : 'error']('公开下载链接已复制（仅公开文件夹内的文件可直接下载）')
}

function rowMenu(row: Row) {
  if (row.kind === 'folder') {
    return [
      { key: 'open', label: '打开' },
      { key: 'share', label: '分享' },
      ...(canPublish.value ? [{ key: 'public', label: row.item.is_public ? '取消公开' : '公开到文件中心' }] : []),
      { key: 'rename', label: '重命名 / 描述' },
      { key: 'move', label: '移动到…' },
      { type: 'divider', key: 'd' },
      { key: 'delete', label: '删除', props: { style: 'color:#d03050' } },
    ]
  }
  return [
    { key: 'download', label: '下载' },
    ...(row.item.preview ? [{ key: 'preview', label: '预览' }] : []),
    { key: 'share', label: '分享' },
    { key: 'copy', label: '复制公开链接' },
    { key: 'rename', label: '重命名 / 备注' },
    { key: 'move', label: '移动到…' },
    { type: 'divider', key: 'd' },
    { key: 'delete', label: '删除', props: { style: 'color:#d03050' } },
  ]
}

function onRowAction(key: string, row: Row) {
  const it = row.item
  if (key === 'open' && row.kind === 'folder') router.push(`/drive/${it.id}`)
  else if (key === 'share') { shareTarget.value = { type: row.kind, id: it.id, name: it.name }; shareShow.value = true }
  else if (key === 'public' && row.kind === 'folder') togglePublic(row.item)
  else if (key === 'rename') nameModal.value = row.kind === 'folder'
    ? { mode: 'rename-folder', id: it.id, value: it.name, desc: row.item.description }
    : { mode: 'rename-file', id: it.id, value: it.name, note: row.item.note }
  else if (key === 'move') picker.value = { show: true, files: row.kind === 'file' ? [it.id] : [], folders: row.kind === 'folder' ? [it.id] : [] }
  else if (key === 'delete') confirmDelete(row.kind === 'file' ? [it.id] : [], row.kind === 'folder' ? [it.id] : [])
  else if (key === 'download' && row.kind === 'file') download(row.item)
  else if (key === 'preview' && row.kind === 'file') download(row.item, true)
  else if (key === 'copy' && row.kind === 'file') copyPublicLink(row.item)
}

const selectedIds = () => ({
  files: checked.value.filter((k) => k.startsWith('f')).map((k) => Number(k.slice(1))),
  folders: checked.value.filter((k) => k.startsWith('d')).map((k) => Number(k.slice(1))),
})

const columns = computed<DataTableColumns<Row>>(() => [
  { type: 'selection' },
  {
    title: '名称', key: 'name', minWidth: 240,
    render: (row) => h('div', { class: 'name-cell', onClick: () => (row.kind === 'folder' ? router.push(`/drive/${row.item.id}`) : download(row.item)) }, [
      row.kind === 'folder'
        ? h('div', { class: 'folder-badge' }, [h(NIcon, { size: 20 }, { default: () => h(FolderOpenOutline) })])
        : h('div', { class: 'file-badge', style: { background: fileKind(row.item.name).color } }, fileKind(row.item.name).ext),
      h('div', { style: 'min-width:0' }, [
        h('div', { class: 'cell-name' }, [
          row.item.name,
          row.kind === 'folder' && row.item.is_public ? h(NTag, { size: 'small', type: 'success', bordered: false, style: 'margin-left:8px' }, { default: () => '公开' }) : null,
        ]),
        h('div', { class: 'muted small truncate' }, row.kind === 'folder' ? `${row.item.files ?? 0} 个文件${row.item.description ? ' · ' + row.item.description : ''}` : row.item.note),
      ]),
    ]),
  },
  { title: '大小', key: 'size', width: 110, className: 'hide-sm', render: (row) => formatBytes(row.kind === 'folder' ? row.item.size ?? 0 : row.item.size) },
  { title: '下载', key: 'downloads', width: 80, className: 'hide-sm', render: (row) => (row.kind === 'file' ? row.item.downloads : '') },
  { title: '更新时间', key: 'updated', width: 160, className: 'hide-sm', render: (row) => formatDate(row.item.updated_at) },
  {
    title: '', key: 'actions', width: 56,
    render: (row) => h(NDropdown, { options: rowMenu(row), trigger: 'click', onSelect: (k: string) => onRowAction(k, row) },
      { default: () => h(NButton, { quaternary: true, circle: true, size: 'small' }, { icon: () => h(NIcon, null, { default: () => h(EllipsisHorizontal) }) }) }),
  },
])

// ------------------------------------------------------------ shares tab
const shares = ref<ShareRow[]>([])
const sharesLoading = ref(false)
async function loadShares() {
  sharesLoading.value = true
  try { shares.value = await api.shares() } catch (e) { message.error(errorMessage(e)) } finally { sharesLoading.value = false }
}
const shareColumns: DataTableColumns<ShareRow> = [
  { title: '名称', key: 'name', minWidth: 180, render: (s) => h('span', null, [s.type === 'folder' ? '📁 ' : '', s.name]) },
  { title: '提取码', key: 'password', width: 90, render: (s) => s.password || '无' },
  { title: '浏览/下载', key: 'stats', width: 100, className: 'hide-sm', render: (s) => `${s.view_count} / ${s.download_count}${s.max_downloads ? ' / ' + s.max_downloads : ''}` },
  { title: '过期时间', key: 'expires_at', width: 150, className: 'hide-sm', render: (s) => (s.expires_at ? formatDate(s.expires_at) : '永久') },
  { title: '状态', key: 'status', width: 90, render: (s) => h(NTag, { size: 'small', bordered: false, type: s.status === 'active' ? 'success' : 'default' }, { default: () => (s.status === 'active' ? '有效' : s.status_text || '失效') }) },
  {
    title: '操作', key: 'op', width: 150,
    render: (s) => h(NSpace, { size: 4, wrap: false }, { default: () => [
      h(NButton, { size: 'tiny', onClick: async () => message[(await copyText(absUrl(`/s/${s.token}`) + (s.password ? `\n提取码：${s.password}` : ''))) ? 'success' : 'error']('已复制') }, { default: () => '复制' }),
      h(NPopconfirm, { onPositiveClick: async () => { await api.deleteShare(s.id).catch((e) => message.error(errorMessage(e))); loadShares() } },
        { trigger: () => h(NButton, { size: 'tiny', type: 'error', ghost: true }, { default: () => '取消分享' }), default: () => '确定取消该分享？链接将立即失效' }),
    ] }),
  },
]

// ------------------------------------------------------------ account tab
const pwd = ref({ current: '', next: '', confirm: '' })
const pwdBusy = ref(false)
async function changePassword() {
  if (pwd.value.next.length < 8) return message.error('新密码至少 8 位')
  if (pwd.value.next !== pwd.value.confirm) return message.error('两次输入的新密码不一致')
  pwdBusy.value = true
  try {
    await api.changePassword(pwd.value.current, pwd.value.next)
    pwd.value = { current: '', next: '', confirm: '' }
    message.success('密码已修改')
  } catch (e) { message.error(errorMessage(e)) } finally { pwdBusy.value = false }
}
const usagePct = computed(() => (store.user?.quota ? Math.min(100, Math.round((store.user.used / store.user.quota) * 100)) : 0))
</script>

<template>
  <div class="container page" @dragover.prevent="tab === 'files' && (dragging = true)" @dragleave.self="dragging = false" @drop.prevent="onDrop">
    <NTabs v-model:value="tab" type="line" animated>
      <NTabPane name="files" tab="我的文件">
        <div class="toolbar">
          <NBreadcrumb>
            <NBreadcrumbItem @click="router.push('/drive')">我的网盘</NBreadcrumbItem>
            <NBreadcrumbItem v-for="c in crumbs" :key="c.id" @click="router.push(`/drive/${c.id}`)">{{ c.name }}</NBreadcrumbItem>
          </NBreadcrumb>
          <NSpace :size="8">
            <template v-if="checked.length">
              <NButton size="small" @click="picker = { show: true, ...selectedIds() }"><template #icon><NIcon><MoveOutline /></NIcon></template>移动 ({{ checked.length }})</NButton>
              <NButton size="small" type="error" ghost @click="confirmDelete(selectedIds().files, selectedIds().folders)"><template #icon><NIcon><TrashOutline /></NIcon></template>删除</NButton>
            </template>
            <NButton size="small" :disabled="rows.length < 2" @click="reorderShow = true"><template #icon><NIcon><SwapVerticalOutline /></NIcon></template>调整顺序</NButton>
            <NButton size="small" @click="load"><template #icon><NIcon><RefreshOutline /></NIcon></template></NButton>
            <NButton size="small" @click="nameModal = { mode: 'new', value: '' }"><template #icon><NIcon><AddOutline /></NIcon></template>新建文件夹</NButton>
            <NButton size="small" type="primary" @click="pickFiles"><template #icon><NIcon><CloudUploadOutline /></NIcon></template>上传文件</NButton>
          </NSpace>
        </div>
        <NAlert v-if="current?.is_public" type="success" :show-icon="false" style="margin-bottom: 10px">
          该文件夹已公开，访客可在 <a :href="`/folder/${current.id}`" target="_blank" style="color: var(--brand)">文件中心</a> 浏览和下载其中的文件。
        </NAlert>
        <input ref="fileInput" type="file" multiple hidden @change="onFiles(($event.target as HTMLInputElement).files)" />
        <div class="table-wrap" :class="{ dragging }">
          <NDataTable v-model:checked-row-keys="checked" :columns="columns" :data="rows" :row-key="(r: Row) => r.key" :loading="loading" :bordered="false" size="small" />
          <div v-if="!loading && !rows.length" class="empty" @click="pickFiles">
            <NIcon :size="44" color="#9aa4b2"><CloudUploadOutline /></NIcon>
            <p>拖拽文件到这里，或点击上传</p>
            <p class="muted small">支持大文件分片上传、断点续传，单文件最大 {{ formatBytes(store.config?.max_file_size ?? 0) }}</p>
          </div>
          <div v-if="dragging" class="drop">松开鼠标上传到「{{ current?.name ?? '我的网盘' }}」</div>
        </div>
      </NTabPane>

      <NTabPane name="shares" tab="我的分享">
        <NDataTable :columns="shareColumns" :data="shares" :loading="sharesLoading" :bordered="false" size="small" :row-key="(s: ShareRow) => s.id" />
      </NTabPane>

      <NTabPane name="account" tab="账号设置">
        <div class="account">
          <div class="usage">
            <div class="muted small">存储空间</div>
            <div style="font-size: 20px; font-weight: 600; margin: 6px 0">
              {{ formatBytes(store.user?.used ?? 0) }} <span class="muted small">/ {{ store.user?.quota ? formatBytes(store.user.quota) : '不限' }}</span>
            </div>
            <NProgress v-if="store.user?.quota" type="line" :percentage="usagePct" :status="usagePct > 90 ? 'error' : 'success'" />
          </div>
          <NForm style="max-width: 380px; margin-top: 20px" @submit.prevent="changePassword">
            <h4 style="margin: 0 0 12px">修改密码</h4>
            <NFormItem label="当前密码"><NInput v-model:value="pwd.current" type="password" :input-props="{ autocomplete: 'current-password' }" /></NFormItem>
            <NFormItem label="新密码"><NInput v-model:value="pwd.next" type="password" placeholder="至少 8 位" :input-props="{ autocomplete: 'new-password' }" /></NFormItem>
            <NFormItem label="确认新密码"><NInput v-model:value="pwd.confirm" type="password" :input-props="{ autocomplete: 'new-password' }" /></NFormItem>
            <NButton type="primary" attr-type="submit" :loading="pwdBusy">保存</NButton>
          </NForm>
        </div>
      </NTabPane>
    </NTabs>

    <NModal :show="!!nameModal" preset="card" :title="nameModal?.mode === 'new' ? '新建文件夹' : '重命名'" style="width: min(440px, 94vw)" @update:show="nameModal = null">
      <NForm v-if="nameModal" @submit.prevent="saveName">
        <NFormItem label="名称"><NInput v-model:value="nameModal.value" maxlength="180" autofocus /></NFormItem>
        <NFormItem v-if="nameModal.mode === 'rename-folder'" label="描述"><NInput v-model:value="nameModal.desc" type="textarea" maxlength="500" placeholder="显示在文件中心（可选）" /></NFormItem>
        <NFormItem v-if="nameModal.mode === 'rename-file'" label="备注"><NInput v-model:value="nameModal.note" type="textarea" maxlength="1000" placeholder="例如版本说明、安装提示（可选）" /></NFormItem>
        <NSpace justify="end"><NButton @click="nameModal = null">取消</NButton><NButton type="primary" attr-type="submit" :loading="savingName">保存</NButton></NSpace>
      </NForm>
    </NModal>
    <FolderPicker v-model:show="picker.show" :exclude="picker.folders" title="移动到" @pick="moveTo" />
    <ShareDialog v-model:show="shareShow" :target="shareTarget" @created="tab === 'shares' && loadShares()" />
    <ReorderModal v-model:show="reorderShow" :folders="folders" :files="files" :title="`调整顺序 · ${current?.name ?? '我的网盘'}`" @saved="load" />
    <UploadPanel />
  </div>
</template>

<style scoped>
.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin: 6px 0 12px; }
.table-wrap { position: relative; background: #fff; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; min-height: 220px; }
.table-wrap.dragging { outline: 2px dashed var(--brand); outline-offset: -6px; }
.drop { position: absolute; inset: 0; background: rgba(22, 132, 91, .08); display: flex; align-items: center; justify-content: center; font-weight: 600; color: var(--brand); pointer-events: none; }
.empty { text-align: center; padding: 30px 0 40px; cursor: pointer; }
.empty p { margin: 6px 0 0; }
.account { max-width: 560px; }
.usage { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
:deep(.name-cell) { display: flex; align-items: center; gap: 12px; cursor: pointer; min-width: 0; }
:deep(.cell-name) { font-weight: 500; word-break: break-all; display: flex; align-items: center; flex-wrap: wrap; }
:deep(.name-cell .file-badge), :deep(.name-cell .folder-badge) { width: 34px; height: 34px; font-size: 9px; }
</style>
