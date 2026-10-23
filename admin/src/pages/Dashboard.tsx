import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CloudUpload, Download, Files, HardDrive, Share2, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { change, formatBytes, formatTime } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader, StatCard } from '@/components/common'
import { Bar } from '@/components/UploadPanel'

export default function Dashboard() {
  const navigate = useNavigate()
  const [days, setDays] = useState(30)
  const [metric, setMetric] = useState<'count' | 'bytes'>('count')
  const d = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 })
  const t = useQuery({ queryKey: ['traffic', days], queryFn: () => api.traffic(days) })
  const s = d.data
  const used = s ? s.disk.total - s.disk.free : 0
  const diskPct = s?.disk.total ? (used / s.disk.total) * 100 : 0

  const series = (t.data ?? []).map((p) => ({
    ...p, label: p.day.slice(5),
    dl: metric === 'count' ? p.downloads : p.download_bytes, up: metric === 'count' ? p.uploads : p.upload_bytes,
  }))
  const fmt = (v: number) => (metric === 'count' ? String(v) : formatBytes(v))

  return (
    <>
      <PageHeader title="仪表盘" description="网盘运行概况" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="文件总数" icon={<Files />} value={s?.files.total ?? '—'} hint={s ? `${formatBytes(s.files.size)} · 今日新增 ${s.files.today}` : ''} onClick={() => navigate('/files')} />
        <StatCard title="今日下载" icon={<Download />} value={s?.downloads.today ?? '—'} trend={s ? change(s.downloads.today, s.downloads.yesterday) : undefined} trendLabel="较昨日"
          hint={s ? ` · 近 7 天 ${s.downloads.week}` : ''} onClick={() => navigate('/logs/downloads')} />
        <StatCard title="用户" icon={<Users />} value={s?.users.total ?? '—'} hint={s ? `启用 ${s.users.active} · 管理员 ${s.users.admins}` : ''} onClick={() => navigate('/users')} />
        <StatCard title="有效分享" icon={<Share2 />} value={s?.shares.active ?? '—'} hint={s ? `共 ${s.shares.total} 个分享` : ''} onClick={() => navigate('/shares')} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle>下载与上传趋势</CardTitle>
            <div className="flex gap-2">
              <Tabs value={metric} onValueChange={(v) => setMetric(v as 'count' | 'bytes')}><TabsList><TabsTrigger value="count">次数</TabsTrigger><TabsTrigger value="bytes">流量</TabsTrigger></TabsList></Tabs>
              <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}><TabsList><TabsTrigger value="7">7 天</TabsTrigger><TabsTrigger value="30">30 天</TabsTrigger><TabsTrigger value="90">90 天</TabsTrigger></TabsList></Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="gdl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gup" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" minTickGap={16} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" width={metric === 'bytes' ? 70 : 36} tickFormatter={fmt} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="dl" name="下载" stroke="hsl(var(--chart-1))" fill="url(#gdl)" strokeWidth={2} />
                  <Area type="monotone" dataKey="up" name="上传" stroke="hsl(var(--chart-2))" fill="url(#gup)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4" />服务器磁盘</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm"><span>已用 {formatBytes(used)}</span><span className="text-muted-foreground">共 {formatBytes(s?.disk.total ?? 0)}</span></div>
              <Bar className="mt-2 h-2" value={diskPct} tone={diskPct > 90 ? 'danger' : diskPct > 75 ? 'warning' : 'default'} />
              <p className="mt-1.5 text-xs text-muted-foreground">剩余 {formatBytes(s?.disk.free ?? 0)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/60 p-3"><div className="text-xs text-muted-foreground">网盘文件</div><div className="mt-1 font-semibold">{formatBytes(s?.files.size ?? 0)}</div></div>
              <div className="rounded-lg bg-muted/60 p-3"><div className="text-xs text-muted-foreground">文件夹 / 公开</div><div className="mt-1 font-semibold">{s?.files.folders ?? 0} / {s?.files.public_folders ?? 0}</div></div>
              <div className="col-span-2 flex cursor-pointer items-center gap-2 rounded-lg bg-muted/60 p-3" onClick={() => navigate('/uploads')}>
                <CloudUpload className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">进行中的上传</span>
                <span className="ml-auto font-semibold">{s?.uploads.active ?? 0} 个 · {formatBytes(s?.uploads.pending_bytes ?? 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>下载排行</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {s?.top_files.map((f, i) => (
              <div key={f.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-center font-semibold text-muted-foreground">{i + 1}</span>
                <span className="flex-1 truncate">{f.name}</span>
                <span className="tabular-nums text-muted-foreground">{f.download_count} 次</span>
              </div>
            ))}
            {s && !s.top_files.length && <p className="text-sm text-muted-foreground">暂无数据</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>最近上传</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {s?.recent_files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{f.name}</span>
                <span className="hidden text-muted-foreground sm:inline">{f.owner?.username}</span>
                <span className="tabular-nums text-muted-foreground">{formatBytes(f.size)}</span>
                <span className="hidden text-xs text-muted-foreground md:inline">{formatTime(f.created_at)}</span>
              </div>
            ))}
            {s && !s.recent_files.length && <p className="text-sm text-muted-foreground">暂无数据</p>}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
