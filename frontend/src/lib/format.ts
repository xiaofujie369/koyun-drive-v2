export { formatBytes, formatEta } from './uploader'

export function formatDate(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const KINDS: [RegExp, string, string][] = [
  [/\.(apk|aab|xapk)$/i, '安卓', '#3ddc84'],
  [/\.(exe|msi|msix|appx)$/i, 'Windows', '#0078d4'],
  [/\.(dmg|pkg)$/i, 'macOS', '#555'],
  [/\.ipa$/i, 'iOS', '#555'],
  [/\.(deb|rpm|appimage|run|sh)$/i, 'Linux', '#e95420'],
  [/\.(zip|7z|rar|tar|gz|tgz|bz2|xz|zst)$/i, '压缩包', '#c58b00'],
  [/\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i, '图片', '#a855f7'],
  [/\.(mp4|mkv|webm|mov|avi|flv|m4v)$/i, '视频', '#ef4444'],
  [/\.(mp3|flac|wav|aac|ogg|m4a)$/i, '音频', '#ec4899'],
  [/\.pdf$/i, 'PDF', '#dc2626'],
  [/\.(docx?|xlsx?|pptx?|txt|md|csv)$/i, '文档', '#2563eb'],
  [/\.(iso|img)$/i, '镜像', '#64748b'],
]

export function fileKind(name: string): { label: string; color: string; ext: string } {
  const ext = (name.split('.').pop() || '').toUpperCase().slice(0, 4)
  for (const [re, label, color] of KINDS) if (re.test(name)) return { label, color, ext }
  return { label: '文件', color: '#64748b', ext: ext || 'FILE' }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export const absUrl = (path: string) => new URL(path, location.origin).toString()
