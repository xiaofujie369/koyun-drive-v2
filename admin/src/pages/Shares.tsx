import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type ShareRow } from '@/lib/api'
import { copyText, formatTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog, EmptyRow, PageHeader, Pagination } from '@/components/common'

export default function Shares() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [del, setDel] = useState<ShareRow | null>(null)
  const list = useQuery({ queryKey: ['shares', page], queryFn: () => api.shares({ page }), placeholderData: keepPreviousData })
  const cfg = useQuery({ queryKey: ['config'], queryFn: api.config })
  const base = cfg.data?.public_url || location.origin
  const copy = async (s: ShareRow) => toast[(await copyText(`${base}/s/${s.token}${s.password ? `\n提取码：${s.password}` : ''}`)) ? 'success' : 'error']('已复制')

  return (
    <>
      <PageHeader title="分享管理" description="所有用户创建的分享链接" />
      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>分享内容</TableHead>
              <TableHead className="hidden sm:table-cell">创建者</TableHead>
              <TableHead>提取码</TableHead>
              <TableHead className="hidden md:table-cell">浏览 / 下载</TableHead>
              <TableHead className="hidden lg:table-cell">过期时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.data.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="max-w-xs"><div className="truncate font-medium">{s.type === 'folder' ? '📁 ' : ''}{s.name}</div><div className="text-xs text-muted-foreground">/s/{s.token}</div></TableCell>
                <TableCell className="hidden sm:table-cell">{s.owner}</TableCell>
                <TableCell className="font-mono">{s.password ?? '—'}</TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">{s.view_count} / {s.download_count}{s.max_downloads ? ` / ${s.max_downloads}` : ''}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{s.expires_at ? formatTime(s.expires_at) : '永久'}</TableCell>
                <TableCell>{s.status === 'active' ? <Badge variant="success">有效</Badge> : <Badge variant="muted">{s.status_text ?? '失效'}</Badge>}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="复制链接" onClick={() => copy(s)}><Copy /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="取消分享" onClick={() => setDel(s)}><Trash2 /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!list.data?.data.length && <EmptyRow cols={7} loading={list.isLoading} />}
          </TableBody>
        </Table>
        {list.data && <Pagination page={list.data.page} perPage={list.data.per_page} total={list.data.total} onChange={setPage} />}
      </Card>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} destructive title="取消分享" confirmText="取消分享"
        description={`「${del?.name}」的分享链接将立即失效。`}
        onConfirm={async () => {
          try { await api.deleteShare(del!.id) } catch (e) { throw new Error(errorMessage(e)) }
          toast.success('已取消分享')
          qc.invalidateQueries({ queryKey: ['shares'] })
        }} />
    </>
  )
}
