import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ACTION_LABELS, formatBytes, formatTime, LOGIN_RESULTS } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyRow, PageHeader, Pagination } from '@/components/common'

const VIA: Record<string, string> = { public: '公开直链', share: '分享链接', owner: '本人/管理员' }

function Downloads() {
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['logs-dl', page], queryFn: () => api.downloadLogs({ page }), placeholderData: keepPreviousData })
  return (
    <>
      <Table>
        <TableHeader><TableRow><TableHead>文件</TableHead><TableHead>方式</TableHead><TableHead className="hidden sm:table-cell">IP</TableHead><TableHead className="hidden lg:table-cell">客户端</TableHead><TableHead>时间</TableHead></TableRow></TableHeader>
        <TableBody>
          {q.data?.data.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="max-w-xs"><div className="truncate font-medium">{l.file_name}</div><div className="text-xs text-muted-foreground">{formatBytes(l.size)}</div></TableCell>
              <TableCell><Badge variant="muted">{VIA[l.via] ?? l.via}</Badge></TableCell>
              <TableCell className="hidden font-mono text-xs sm:table-cell">{l.ip}</TableCell>
              <TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground lg:table-cell" title={l.user_agent}>{l.user_agent}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatTime(l.created_at)}</TableCell>
            </TableRow>
          ))}
          {!q.data?.data.length && <EmptyRow cols={5} loading={q.isLoading} />}
        </TableBody>
      </Table>
      {q.data && <Pagination page={q.data.page} perPage={q.data.per_page} total={q.data.total} onChange={setPage} />}
    </>
  )
}

function Audit() {
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['logs-audit', page], queryFn: () => api.audit({ page }), placeholderData: keepPreviousData })
  return (
    <>
      <Table>
        <TableHeader><TableRow><TableHead>管理员</TableHead><TableHead>操作</TableHead><TableHead className="hidden md:table-cell">详情</TableHead><TableHead className="hidden sm:table-cell">IP</TableHead><TableHead>时间</TableHead></TableRow></TableHeader>
        <TableBody>
          {q.data?.data.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">{l.username}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">{ACTION_LABELS[l.action] ?? l.action}{!l.success && <Badge variant="destructive">失败</Badge>}</div>
                {l.target && <div className="text-xs text-muted-foreground">{l.target}</div>}
              </TableCell>
              <TableCell className="hidden max-w-sm truncate font-mono text-xs text-muted-foreground md:table-cell" title={JSON.stringify(l.details)}>{l.details ? JSON.stringify(l.details) : ''}</TableCell>
              <TableCell className="hidden font-mono text-xs sm:table-cell">{l.ip}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatTime(l.created_at)}</TableCell>
            </TableRow>
          ))}
          {!q.data?.data.length && <EmptyRow cols={5} loading={q.isLoading} />}
        </TableBody>
      </Table>
      {q.data && <Pagination page={q.data.page} perPage={q.data.per_page} total={q.data.total} onChange={setPage} />}
    </>
  )
}

function Logins() {
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['logs-login', page], queryFn: () => api.logins({ page }), placeholderData: keepPreviousData })
  return (
    <>
      <Table>
        <TableHeader><TableRow><TableHead>用户名</TableHead><TableHead>结果</TableHead><TableHead>IP</TableHead><TableHead className="hidden lg:table-cell">客户端</TableHead><TableHead>时间</TableHead></TableRow></TableHeader>
        <TableBody>
          {q.data?.data.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">{l.username}</TableCell>
              <TableCell><Badge variant={l.result === 'success' ? 'success' : 'destructive'}>{LOGIN_RESULTS[l.result] ?? l.result}</Badge></TableCell>
              <TableCell className="font-mono text-xs">{l.ip}</TableCell>
              <TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground lg:table-cell" title={l.user_agent}>{l.user_agent}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatTime(l.created_at)}</TableCell>
            </TableRow>
          ))}
          {!q.data?.data.length && <EmptyRow cols={5} loading={q.isLoading} />}
        </TableBody>
      </Table>
      {q.data && <Pagination page={q.data.page} perPage={q.data.per_page} total={q.data.total} onChange={setPage} />}
    </>
  )
}

const KINDS = {
  downloads: { title: '下载记录', desc: '同一 IP 一小时内重复下载同一文件只记一次（下载工具的多线程请求不会重复计数）', C: Downloads },
  audit: { title: '操作审计', desc: '管理员的所有修改操作', C: Audit },
  logins: { title: '登录记录', desc: '所有账号的登录尝试', C: Logins },
}

export default function Logs() {
  const { kind = 'downloads' } = useParams()
  const k = KINDS[kind as keyof typeof KINDS] ?? KINDS.downloads
  return (
    <>
      <PageHeader title={k.title} description={k.desc} />
      <Card className="p-4"><k.C key={kind} /></Card>
    </>
  )
}
