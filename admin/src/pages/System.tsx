import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { formatBytes, formatTime } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common'
import { Bar } from '@/components/UploadPanel'

const NAMES: Record<string, string> = { mysql: 'MySQL', redis: 'Redis', octane_cache: 'Octane 缓存' }

export default function System() {
  const q = useQuery({ queryKey: ['system'], queryFn: api.system, refetchInterval: 30_000 })
  const s = q.data
  const used = s ? s.storage.disk_total - s.storage.disk_free : 0
  return (
    <>
      <PageHeader title="系统状态" description={s ? `服务器时间 ${formatTime(s.server_time)}` : ''} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>服务</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {s && Object.entries(s.services).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                {v.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                <span className="font-medium">{NAMES[k] ?? k}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground" title={v.error ?? v.version}>{v.ok ? `${v.version ?? ''} · ${v.ms} ms` : v.error}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>版本</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {s && Object.entries(s.versions).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="capitalize text-muted-foreground">{k}</span><span className="font-mono">{v ?? '—'}</span></div>
            ))}
            {s && <div className="flex justify-between"><span className="text-muted-foreground">Worker 内存</span><span className="font-mono">{formatBytes(s.php.memory_usage)} / {s.php.memory_limit}</span></div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>存储</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span>已用 {formatBytes(used)}</span><span className="text-muted-foreground">共 {formatBytes(s?.storage.disk_total ?? 0)}</span></div>
            <Bar className="h-2" value={s?.storage.disk_total ? (used / s.storage.disk_total) * 100 : 0} />
            <div className="flex justify-between"><span className="text-muted-foreground">剩余空间</span><span>{formatBytes(s?.storage.disk_free ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">未完成上传占用</span><span>{formatBytes(s?.storage.tmp_bytes ?? 0)}</span></div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
