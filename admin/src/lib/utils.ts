import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(n: number) {
  if (!n) return '0'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

export function formatTime(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

export function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const buf = crypto.getRandomValues(new Uint32Array(14))
  return Array.from(buf, (n) => chars[n % chars.length]).join('') + '7a'
}

export function formatDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('zh-CN')
}

export function relativeTime(iso?: string | null) {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  const abs = Math.abs(diff)
  const suffix = diff >= 0 ? '前' : '后'
  if (abs < 60) return diff >= 0 ? '刚刚' : '即将'
  if (abs < 3600) return `${Math.round(abs / 60)} 分钟${suffix}`
  if (abs < 86400) return `${Math.round(abs / 3600)} 小时${suffix}`
  return `${Math.round(abs / 86400)} 天${suffix}`
}

/** Percentage change, or null when there is no baseline. */
export function change(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0
  return ((current - previous) / previous) * 100
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const ACTION_LABELS: Record<string, string> = {
  'admin.users.store': '新建用户', 'admin.users.update': '修改用户', 'admin.users.password': '重置密码', 'admin.users.destroy': '删除用户',
  'admin.uploads.destroy': '清理上传会话', 'admin.settings.update': '修改系统设置',
  'drive.folders.store': '新建文件夹', 'drive.folders.update': '修改文件夹', 'drive.folders.destroy': '删除文件夹',
  'drive.files.update': '修改文件', 'drive.files.destroy': '删除文件', 'drive.batch': '批量移动/删除', 'drive.reorder': '调整顺序',
  'drive.shares.store': '创建分享', 'drive.shares.destroy': '取消分享',
  'uploads.init': '开始上传', 'uploads.complete': '上传完成', 'uploads.cancel': '取消上传', 'account.password': '修改自己的密码',
  'auth.password': '修改自己的密码',
}

export const LOGIN_RESULTS: Record<string, string> = {
  success: '成功', bad_credentials: '密码错误', disabled: '账号停用', locked: '已锁定',
}

const KINDS: [RegExp, string][] = [
  [/\.(apk|aab|xapk)$/i, '#3ddc84'], [/\.(exe|msi|msix|appx)$/i, '#0078d4'], [/\.(dmg|pkg|ipa)$/i, '#555'],
  [/\.(deb|rpm|appimage|run|sh)$/i, '#e95420'], [/\.(zip|7z|rar|tar|gz|tgz|bz2|xz|zst)$/i, '#c58b00'],
  [/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i, '#a855f7'], [/\.(mp4|mkv|webm|mov|avi)$/i, '#ef4444'], [/\.pdf$/i, '#dc2626'],
]
export function fileColor(name: string) {
  for (const [re, c] of KINDS) if (re.test(name)) return c
  return '#64748b'
}
export function fileExt(name: string) {
  const e = name.includes('.') ? name.split('.').pop()! : ''
  return (e || 'FILE').toUpperCase().slice(0, 4)
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove(); return ok
  }
}
