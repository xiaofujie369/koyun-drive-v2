import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type Settings as S } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ErrorBox, Field, PageHeader } from '@/components/common'

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted-foreground">{hint}</div></div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export default function Settings() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings'], queryFn: api.settings })
  const [f, setF] = useState<S | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (q.data) setF(q.data) }, [q.data])
  if (!f) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
  const set = <K extends keyof S>(k: K, v: S[K]) => setF({ ...f, [k]: v })

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const saved = await api.saveSettings(f)
      qc.setQueryData(['settings'], saved)
      qc.invalidateQueries({ queryKey: ['config'] })
      toast.success('设置已保存')
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="系统设置" actions={<Button onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />}保存设置</Button>} />
      <ErrorBox error={error} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>站点</CardTitle><CardDescription>前台文件中心的显示内容</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Field label="站点名称"><Input value={f.site_name} maxLength={60} onChange={(e) => set('site_name', e.target.value)} /></Field>
            <Field label="副标题"><Input value={f.site_subtitle} maxLength={120} onChange={(e) => set('site_subtitle', e.target.value)} /></Field>
            <Field label="公告" hint="显示在首页顶部，留空不显示"><Textarea rows={4} value={f.announcement} maxLength={2000} onChange={(e) => set('announcement', e.target.value)} /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>上传</CardTitle><CardDescription>大文件按分片上传，任何分片失败都会自动重试，中断后可断点续传</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Field label="上传专用域名" hint="分片直接发送到该域名（应为 Cloudflare 灰云/DNS only，避免 100MB 限制）。留空则使用当前访问域名。">
              <Input placeholder="https://upload.example.com" value={f.upload_url} onChange={(e) => set('upload_url', e.target.value.trim())} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="分片大小 (MB)" hint="1-32，建议 8"><Input type="number" min={1} max={32} value={f.chunk_size_mb} onChange={(e) => set('chunk_size_mb', Number(e.target.value))} /></Field>
              <Field label="单文件上限 (GB)" hint="0 表示不限"><Input type="number" min={0} value={f.max_file_size_gb} onChange={(e) => set('max_file_size_gb', Number(e.target.value))} /></Field>
            </div>
            <Field label="普通用户默认配额 (GB)" hint="0 表示不限；可在用户管理中单独设置"><Input type="number" min={0} value={f.default_quota_gb} onChange={(e) => set('default_quota_gb', Number(e.target.value))} /></Field>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>访问与权限</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Toggle label="开放注册" hint="允许访客自行注册普通账号" checked={f.allow_register} onChange={(v) => set('allow_register', v)} />
            <Toggle label="普通用户可公开文件夹" hint="允许普通用户把自己的文件夹公开到文件中心" checked={f.user_public_folders} onChange={(v) => set('user_public_folders', v)} />
            <Toggle label="公开搜索" hint="在文件中心提供文件搜索" checked={f.public_search} onChange={(v) => set('public_search', v)} />
            <Toggle label="下载需要登录" hint="开启后公开文件也需登录才能下载（分享链接不受影响）" checked={f.download_requires_login} onChange={(v) => set('download_requires_login', v)} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
