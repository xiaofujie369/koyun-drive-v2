import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Download, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { cn, fileColor, fileExt, formatBytes, formatTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog, EmptyRow, PageHeader, Pagination } from '@/components/common'

type Sort = 'created_at' | 'name' | 'size' | 'download_count'

export default function Files() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<Sort>('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [del, setDel] = useState<number[] | null>(null)
  const list = useQuery({ queryKey: ['files', search, page, sort, dir], queryFn: () => api.files({ q: search, page, sort, dir, per_page: 30 }), placeholderData: keepPreviousData })
  const rows = list.data?.data ?? []

  const sortBy = (s: Sort) => { if (s === sort) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(s); setDir('desc') } }
  const Head = ({ s, children, className }: { s: Sort; children: string; className?: string }) => (
    <TableHead className={cn('cursor-pointer select-none', className)} onClick={() => sortBy(s)}>
      <span className="inline-flex items-center gap-1">{children}{sort === s && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
    </TableHead>
  )
  const download = async (id: number) => {
    try { location.href = (await api.fileLink(id)).url } catch (e) { toast.error(errorMessage(e)) }
  }

  return (
    <>
      <PageHeader title="全部文件" description="所有用户的文件；在「文件浏览与上传」中可按文件夹管理"
        actions={checked.size > 0 && <Button variant="outline" className="text-destructive" onClick={() => setDel([...checked])}><Trash2 />删除所选 ({checked.size})</Button>} />
      <Card className="p-4">
        <form className="mb-3 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()) }}>
          <Input placeholder="搜索文件名或备注" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" variant="outline"><Search />搜索</Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox checked={rows.length > 0 && rows.every((r) => checked.has(r.id))} onCheckedChange={(v) => setChecked(v ? new Set(rows.map((r) => r.id)) : new Set())} /></TableHead>
              <Head s="name">名称</Head>
              <TableHead className="hidden md:table-cell">位置</TableHead>
              <Head s="size" className="w-24">大小</Head>
              <Head s="download_count" className="hidden w-20 sm:table-cell">下载</Head>
              <Head s="created_at" className="hidden w-40 lg:table-cell">上传时间</Head>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => (
              <TableRow key={f.id}>
                <TableCell><Checkbox checked={checked.has(f.id)} onCheckedChange={() => setChecked((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n })} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white" style={{ background: fileColor(f.name) }}>{fileExt(f.name)}</span>
                    <span className="min-w-0"><span className="block break-all font-medium">{f.name}</span>{f.note && <span className="block truncate text-xs text-muted-foreground">{f.note}</span>}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{f.owner} / {f.folder ?? '根目录'}</TableCell>
                <TableCell className="tabular-nums">{formatBytes(f.size)}</TableCell>
                <TableCell className="hidden tabular-nums sm:table-cell">{f.downloads}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{formatTime(f.created_at)}</TableCell>
                <TableCell><Button size="icon" variant="ghost" className="h-8 w-8" title="下载" onClick={() => download(f.id)}><Download /></Button></TableCell>
              </TableRow>
            ))}
            {!rows.length && <EmptyRow cols={7} loading={list.isLoading} />}
          </TableBody>
        </Table>
        {list.data && <Pagination page={list.data.page} perPage={list.data.per_page} total={list.data.total} onChange={setPage} />}
      </Card>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} destructive title="确认删除" confirmText="永久删除"
        description={`将永久删除 ${del?.length ?? 0} 个文件，无法恢复。`}
        onConfirm={async () => {
          try { await api.batch({ action: 'delete', file_ids: del!, folder_ids: [] }) } catch (e) { throw new Error(errorMessage(e)) }
          toast.success('已删除')
          setChecked(new Set())
          qc.invalidateQueries({ queryKey: ['files'] })
        }} />
    </>
  )
}
