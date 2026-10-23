import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { formatBytes, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyRow, PageHeader } from '@/components/common'
import { Bar } from '@/components/UploadPanel'

export default function Uploads() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['uploads'], queryFn: api.uploads, refetchInterval: 5000 })
  const remove = async (id: string) => {
    try { await api.deleteUpload(id); toast.success('已清理'); qc.invalidateQueries({ queryKey: ['uploads'] }) } catch (e) { toast.error(errorMessage(e)) }
  }
  return (
    <>
      <PageHeader title="上传任务" description="服务器上未完成的分片上传会话。中断的上传重新选择同一文件即可断点续传；72 小时无进展的会话会被自动清理。" />
      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>文件</TableHead>
              <TableHead className="hidden sm:table-cell">用户</TableHead>
              <TableHead className="w-48">进度</TableHead>
              <TableHead className="hidden md:table-cell">最后活动</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell><div className="break-all font-medium">{u.name}</div><div className="text-xs text-muted-foreground">{formatBytes(u.size)}</div></TableCell>
                <TableCell className="hidden sm:table-cell">{u.user}</TableCell>
                <TableCell>
                  <Bar value={(u.received_chunks / Math.max(1, u.total_chunks)) * 100} />
                  <div className="mt-1 text-xs text-muted-foreground">{u.received_chunks} / {u.total_chunks} 分片{u.status === 'merging' ? ' · 保存中' : ''}</div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{relativeTime(u.updated_at)}</TableCell>
                <TableCell><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="清理" onClick={() => remove(u.id)}><Trash2 /></Button></TableCell>
              </TableRow>
            ))}
            {!list.data?.length && <EmptyRow cols={5} loading={list.isLoading} text="没有进行中的上传" />}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
