import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, CloudUpload, Download, Eye, Folder, FolderOpen, FolderPlus, Globe, Link2, Lock, MoreHorizontal,
  ArrowUpDown, GripVertical, MoveRight, Pencil, RefreshCw, Share2, Trash2, User,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type DriveFile, type DriveFolder, type FolderRow, type Listing } from '@/lib/api'
import { onUploadDone, uploader } from '@/lib/uploads'
import { cn, copyText, fileColor, fileExt, formatBytes, formatTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog, EmptyRow, PageHeader } from '@/components/common'
import { EditDialog, MoveDialog, ReorderDialog, ShareDialog, type EditTarget } from '@/components/dialogs'

type Loc = { ownerId: number; folderId: number | null }

function Tree({ folders, loc, onPick, meId }: { folders: FolderRow[]; loc: Loc | null; onPick: (l: Loc) => void; meId: number }) {
  const owners = useMemo(() => {
    const map = new Map<number, string>()
    folders.forEach((f) => map.set(f.owner_id, f.owner))
    if (!map.has(meId)) map.set(meId, '我')
    return [...map.entries()].sort((a, b) => (a[0] === meId ? -1 : b[0] === meId ? 1 : a[1].localeCompare(b[1])))
  }, [folders, meId])
  const [closed, setClosed] = useState<Record<string, boolean>>({})

  const node = (f: FolderRow, depth: number): JSX.Element => {
    const kids = folders.filter((c) => c.parent_id === f.id).sort((a, b) => b.sort_order - a.sort_order || a.name.localeCompare(b.name, 'zh-CN'))
    const active = loc?.folderId === f.id
    const isClosed = closed[`f${f.id}`]
    return (
      <div key={f.id}>
        <div className={cn('flex items-center gap-1 rounded-md py-1 pr-2 text-sm hover:bg-accent', active && 'bg-accent font-medium')} style={{ paddingLeft: 8 + depth * 14 }}>
          <button type="button" className={cn('h-4 w-4 shrink-0 text-muted-foreground', !kids.length && 'invisible')} onClick={() => setClosed((c) => ({ ...c, [`f${f.id}`]: !isClosed }))}>
            <ChevronRight className={cn('h-4 w-4 transition-transform', !isClosed && 'rotate-90')} />
          </button>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onPick({ ownerId: f.owner_id, folderId: f.id })}>
            {active ? <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" /> : <Folder className="h-4 w-4 shrink-0 text-amber-500" />}
            <span className="truncate">{f.name}</span>
            {f.is_public && <Globe className="h-3 w-3 shrink-0 text-success" />}
          </button>
        </div>
        {!isClosed && kids.map((k) => node(k, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {owners.map(([id, name]) => (
        <div key={id}>
          <button type="button" onClick={() => onPick({ ownerId: id, folderId: null })}
            className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-accent', loc?.ownerId === id && loc.folderId === null && 'bg-accent')}>
            <User className="h-4 w-4 text-muted-foreground" />{id === meId ? '我的网盘' : `${name} 的网盘`}
          </button>
          {folders.filter((f) => f.owner_id === id && f.parent_id === null)
            .sort((a, b) => b.sort_order - a.sort_order || a.name.localeCompare(b.name, 'zh-CN')).map((f) => node(f, 1))}
        </div>
      ))}
    </div>
  )
}

export default function Browser() {
  const qc = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const cfg = useQuery({ queryKey: ['config'], queryFn: api.config })
  const tree = useQuery({ queryKey: ['folders'], queryFn: api.folders })
  const [loc, setLoc] = useState<Loc | null>(() => {
    try { const s = sessionStorage.getItem('drive-admin-loc'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const meId = me.data?.id ?? 0
  const at: Loc = loc ?? { ownerId: meId, folderId: null }
  const list = useQuery({
    queryKey: ['list', at.ownerId, at.folderId],
    queryFn: () => api.list({ folder_id: at.folderId, owner_id: at.folderId ? undefined : at.ownerId }),
    enabled: !!meId,
  })
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [edit, setEdit] = useState<EditTarget | null>(null)
  const [move, setMove] = useState<{ files: number[]; folders: number[] } | null>(null)
  const [share, setShare] = useState<{ type: 'file' | 'folder'; id: number; name: string } | null>(null)
  const [del, setDel] = useState<{ files: number[]; folders: number[] } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [reorder, setReorder] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const pick = (l: Loc) => {
    setLoc(l)
    setChecked(new Set())
    try { sessionStorage.setItem('drive-admin-loc', JSON.stringify(l)) } catch { /* ignore */ }
  }
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['list'] })
    qc.invalidateQueries({ queryKey: ['folders'] })
  }
  useEffect(() => onUploadDone(() => refresh()), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (list.isError) pick({ ownerId: meId, folderId: null }) }, [list.isError]) // eslint-disable-line react-hooks/exhaustive-deps

  const folders = list.data?.folders ?? []
  const files = list.data?.files ?? []
  const current = list.data?.folder ?? null
  const label = current?.name ?? (at.ownerId === meId ? '我的网盘' : `${list.data?.owner?.username ?? ''} 的网盘`)

  const addFiles = (fl: FileList | null) => {
    if (!fl?.length) return
    const max = cfg.data?.max_file_size ?? 0
    const ok = Array.from(fl).filter((f) => (max && f.size > max ? (toast.error(`${f.name} 超过单文件上限 ${formatBytes(max)}`), false) : true))
    // Uploading into another user's root is not possible (root = the uploader's own); use one of their folders.
    if (!at.folderId && at.ownerId !== meId) return toast.error('请先选择该用户的某个文件夹再上传')
    uploader.add(ok, at.folderId, label)
    if (input.current) input.current.value = ''
  }
  // Files dragged in from the computer upload; rows dragged inside the table reorder/move instead.
  const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); if (isFileDrag(e)) addFiles(e.dataTransfer.files) }

  // ---- drag rows to reorder (folder↔folder, file↔file) or drop a file onto a folder to move it
  const listKey = ['list', at.ownerId, at.folderId]
  const rowDrag = useRef<{ kind: 'folder' | 'file'; id: number; moved: boolean; done: boolean } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  const saveOrder = async () => {
    const d = qc.getQueryData<Listing>(listKey)
    if (!d) return
    try {
      await api.reorder({ folder_ids: d.folders.map((f) => f.id), file_ids: d.files.map((f) => f.id) })
      toast.success('顺序已保存')
    } catch (e) { toast.error(errorMessage(e)); refresh() }
  }
  const rowProps = (kind: 'folder' | 'file', id: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', `${kind}:${id}`)
      rowDrag.current = { kind, id, moved: false, done: false }
      setDragId(`${kind}${id}`)
    },
    onDragOver: (e: DragEvent) => {
      const d = rowDrag.current
      if (!d) return
      e.preventDefault()
      e.stopPropagation()
      if (d.kind === kind && d.id !== id) {
        setDropTarget(null)
        qc.setQueryData<Listing>(listKey, (old) => {
          if (!old) return old
          const field = kind === 'folder' ? 'folders' : 'files'
          const arr = [...old[field]] as (DriveFolder | DriveFile)[]
          const from = arr.findIndex((x) => x.id === d.id)
          const to = arr.findIndex((x) => x.id === id)
          if (from < 0 || to < 0) return old
          arr.splice(to, 0, ...arr.splice(from, 1))
          d.moved = true
          return { ...old, [field]: arr }
        })
      } else if (d.kind === 'file' && kind === 'folder') {
        setDropTarget(id)
      }
    },
    onDrop: async (e: DragEvent) => {
      const d = rowDrag.current
      if (!d) return
      e.preventDefault()
      e.stopPropagation()
      if (d.kind === 'file' && kind === 'folder') {
        d.done = true
        const name = folders.find((f) => f.id === id)?.name
        try {
          await api.batch({ action: 'move', file_ids: [d.id], folder_ids: [], target_id: id })
          toast.success(`已移动到「${name}」`)
          refresh()
        } catch (err) { toast.error(errorMessage(err)) }
      }
    },
    onDragEnd: () => {
      const d = rowDrag.current
      rowDrag.current = null
      setDragId(null)
      setDropTarget(null)
      if (d && d.moved && !d.done) void saveOrder()
    },
  })

  const sel = () => ({
    files: [...checked].filter((k) => k[0] === 'f').map((k) => Number(k.slice(1))),
    folders: [...checked].filter((k) => k[0] === 'd').map((k) => Number(k.slice(1))),
  })
  const toggle = (key: string) => setChecked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const allKeys = [...folders.map((f) => `d${f.id}`), ...files.map((f) => `f${f.id}`)]
  const allChecked = allKeys.length > 0 && allKeys.every((k) => checked.has(k))

  const save = async (t: EditTarget) => {
    if (t.kind === 'new') await api.createFolder({ name: t.name, parent_id: at.folderId, description: t.text, is_public: t.isPublic, owner_id: at.folderId ? undefined : at.ownerId })
    else if (t.kind === 'folder') await api.updateFolder(t.id!, { name: t.name, description: t.text, is_public: t.isPublic, sort_order: t.sortOrder })
    else await api.updateFile(t.id!, { name: t.name, note: t.text })
    toast.success('已保存')
    refresh()
  }
  const togglePublic = async (f: DriveFolder) => {
    try { await api.updateFolder(f.id, { is_public: !f.is_public }); toast.success(f.is_public ? '已取消公开' : '已公开到文件中心'); refresh() } catch (e) { toast.error(errorMessage(e)) }
  }
  const download = async (f: DriveFile, preview = false) => {
    try {
      const r = await api.fileLink(f.id)
      if (preview && r.preview_url) window.open(r.preview_url, '_blank', 'noopener')
      else location.href = r.url
    } catch (e) { toast.error(errorMessage(e)) }
  }
  const copyPublic = async (f: DriveFile) => {
    const ok = await copyText(`${cfg.data?.public_url || location.origin}/d/${f.id}/${encodeURIComponent(f.name)}`)
    toast[ok ? 'success' : 'error'](ok ? '直链已复制（文件所在文件夹公开时可直接下载）' : '复制失败')
  }

  return (
    <div onDragOver={(e) => { e.preventDefault(); if (isFileDrag(e)) setDragging(true) }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }} onDrop={onDrop}>
      <PageHeader
        title="文件浏览与上传"
        description={<>拖动行可调整顺序，把文件拖到文件夹上可移动。支持大文件分片上传与断点续传（单文件上限 {formatBytes(cfg.data?.max_file_size ?? 0)}），可直接拖拽文件到此页面。分片经 {cfg.data?.upload_url || '当前域名'} 上传。</>}
      />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="max-h-[70vh] overflow-y-auto p-2 lg:sticky lg:top-20">
          <Tree folders={tree.data ?? []} loc={at} onPick={pick} meId={meId} />
        </Card>

        <Card className={cn('relative min-h-[360px] overflow-hidden', dragging && 'ring-2 ring-primary ring-offset-2')}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
              <button type="button" className="font-medium hover:underline" onClick={() => pick({ ownerId: at.ownerId, folderId: null })}>
                {at.ownerId === meId ? '我的网盘' : `${list.data?.owner?.username ?? '…'} 的网盘`}
              </button>
              {list.data?.breadcrumbs.map((c) => (
                <span key={c.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <button type="button" className="hover:underline" onClick={() => pick({ ownerId: at.ownerId, folderId: c.id })}>{c.name}</button>
                </span>
              ))}
              {current?.is_public && <Badge variant="success" className="ml-2">公开</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              {checked.size > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setMove(sel())}><MoveRight />移动 ({checked.size})</Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDel(sel())}><Trash2 />删除</Button>
                </>
              )}
              <Button size="sm" variant="outline" disabled={folders.length + files.length < 2} onClick={() => setReorder(true)}><ArrowUpDown />调整顺序</Button>
              <Button size="sm" variant="outline" onClick={refresh} title="刷新"><RefreshCw className={cn(list.isFetching && 'animate-spin')} /></Button>
              <Button size="sm" variant="outline" onClick={() => setEdit({ kind: 'new', name: '', text: '', isPublic: !at.folderId && at.ownerId === meId, sortOrder: 0 })}><FolderPlus />新建文件夹</Button>
              <Button size="sm" onClick={() => input.current?.click()}><CloudUpload />上传文件</Button>
              <input ref={input} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </div>
          </div>
          {current?.description && <div className="border-b bg-muted/30 px-4 py-2 text-sm text-muted-foreground">{current.description}</div>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16"><Checkbox className="ml-5" checked={allChecked} onCheckedChange={(v) => setChecked(v ? new Set(allKeys) : new Set())} /></TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="hidden w-28 md:table-cell">大小</TableHead>
                <TableHead className="hidden w-20 md:table-cell">下载</TableHead>
                <TableHead className="hidden w-44 lg:table-cell">更新时间</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.map((f) => (
                <TableRow key={`d${f.id}`} {...rowProps('folder', f.id)}
                  className={cn('group', dragId === `folder${f.id}` && 'opacity-40', dropTarget === f.id && 'bg-primary/10 outline outline-2 -outline-offset-2 outline-primary')}>
                  <TableCell><div className="flex items-center gap-1"><GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground" /><Checkbox checked={checked.has(`d${f.id}`)} onCheckedChange={() => toggle(`d${f.id}`)} /></div></TableCell>
                  <TableCell>
                    <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => pick({ ownerId: f.owner_id, folderId: f.id })}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15"><Folder className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-medium">{f.name}{f.is_public ? <Badge variant="success">公开</Badge> : <Lock className="h-3 w-3 text-muted-foreground" />}</span>
                        <span className="block truncate text-xs text-muted-foreground">{f.files ?? 0} 个文件{f.description ? ` · ${f.description}` : ''}</span>
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">{formatBytes(f.size ?? 0)}</TableCell>
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{formatTime(f.updated_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => pick({ ownerId: f.owner_id, folderId: f.id })}><FolderOpen />打开</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => togglePublic(f)}><Globe />{f.is_public ? '取消公开' : '公开到文件中心'}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setShare({ type: 'folder', id: f.id, name: f.name })}><Share2 />分享</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEdit({ kind: 'folder', id: f.id, name: f.name, text: f.description, isPublic: f.is_public, sortOrder: f.sort_order })}><Pencil />编辑</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setMove({ files: [], folders: [f.id] })}><MoveRight />移动到…</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setDel({ files: [], folders: [f.id] })}><Trash2 />删除</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {files.map((f) => (
                <TableRow key={`f${f.id}`} {...rowProps('file', f.id)} className={cn('group', dragId === `file${f.id}` && 'opacity-40')}>
                  <TableCell><div className="flex items-center gap-1"><GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground" /><Checkbox checked={checked.has(`f${f.id}`)} onCheckedChange={() => toggle(`f${f.id}`)} /></div></TableCell>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-white" style={{ background: fileColor(f.name) }}>{fileExt(f.name)}</span>
                      <span className="min-w-0">
                        <span className="block break-all font-medium">{f.name}</span>
                        {f.note && <span className="block truncate text-xs text-muted-foreground">{f.note}</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">{formatBytes(f.size)}</TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">{f.downloads}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{formatTime(f.updated_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => download(f)}><Download />下载</DropdownMenuItem>
                        {f.preview && <DropdownMenuItem onSelect={() => download(f, true)}><Eye />预览</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => copyPublic(f)}><Link2 />复制直链</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setShare({ type: 'file', id: f.id, name: f.name })}><Share2 />分享</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEdit({ kind: 'file', id: f.id, name: f.name, text: f.note })}><Pencil />重命名 / 备注</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setMove({ files: [f.id], folders: [] })}><MoveRight />移动到…</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setDel({ files: [f.id], folders: [] })}><Trash2 />删除</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!folders.length && !files.length && <EmptyRow cols={6} loading={list.isLoading} text="空文件夹 — 拖拽文件到这里或点击「上传文件」" />}
            </TableBody>
          </Table>
          {dragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10 text-lg font-semibold text-primary">
              松开鼠标上传到「{label}」
            </div>
          )}
        </Card>
      </div>

      <EditDialog target={edit} onOpenChange={(o) => !o && setEdit(null)} onSave={save} />
      <MoveDialog open={!!move} onOpenChange={(o) => !o && setMove(null)} folders={tree.data ?? []} ownerId={at.ownerId} exclude={move?.folders ?? []}
        onMove={async (target) => { await api.batch({ action: 'move', file_ids: move!.files, folder_ids: move!.folders, target_id: target }); toast.success('移动成功'); setChecked(new Set()); refresh() }} />
      <ShareDialog target={share} onOpenChange={(o) => !o && setShare(null)} />
      <ReorderDialog open={reorder} onOpenChange={setReorder} title={`调整顺序 · ${label}`} folders={folders} files={files} onSaved={refresh} />
      <ConfirmDialog
        open={!!del} onOpenChange={(o) => !o && setDel(null)} destructive title="确认删除" confirmText="永久删除"
        description={del?.folders.length ? `将删除 ${del.files.length + del.folders.length} 个项目，文件夹内的所有文件和子文件夹也会被永久删除，无法恢复。` : `将永久删除 ${del?.files.length ?? 0} 个文件，无法恢复。`}
        onConfirm={async () => {
          try {
            const r = await api.batch({ action: 'delete', file_ids: del!.files, folder_ids: del!.folders })
            toast.success(`已删除 ${r.files} 个文件${r.folders ? `、${r.folders} 个文件夹` : ''}`)
            setChecked(new Set())
            refresh()
          } catch (e) { throw new Error(errorMessage(e)) }
        }}
      />
    </div>
  )
}
