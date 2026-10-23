import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpToLine, Copy, GripVertical, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type FolderRow, type ShareRow } from '@/lib/api'
import { cn, copyText, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ErrorBox, Field } from '@/components/common'

/** Folder options of one owner, indented by depth. */
export function folderOptions(folders: FolderRow[], ownerId: number, exclude: number[] = []) {
  const banned = new Set<number>()
  const collect = (id: number) => { banned.add(id); folders.filter((f) => f.parent_id === id).forEach((f) => collect(f.id)) }
  exclude.forEach(collect)
  const out: { id: number; label: string }[] = []
  const walk = (parent: number | null, depth: number) => {
    folders.filter((f) => f.owner_id === ownerId && f.parent_id === parent && !banned.has(f.id))
      .sort((a, b) => b.sort_order - a.sort_order || a.name.localeCompare(b.name, 'zh-CN'))
      .forEach((f) => { out.push({ id: f.id, label: `${'　'.repeat(depth)}${f.name}` }); walk(f.id, depth + 1) })
  }
  walk(null, 0)
  return out
}

export function MoveDialog({ open, onOpenChange, folders, ownerId, exclude, onMove }: {
  open: boolean; onOpenChange: (o: boolean) => void; folders: FolderRow[]; ownerId: number; exclude: number[]
  onMove: (target: number | null) => Promise<unknown>
}) {
  const [target, setTarget] = useState('root')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const options = useMemo(() => folderOptions(folders, ownerId, exclude), [folders, ownerId, exclude])
  useEffect(() => { if (open) { setTarget('root'); setError('') } }, [open])
  const run = async () => {
    setBusy(true)
    try { await onMove(target === 'root' ? null : Number(target)); onOpenChange(false) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>移动到</DialogTitle></DialogHeader>
        <Field label="目标文件夹">
          <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="root">（根目录）</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </NativeSelect>
        </Field>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={run} disabled={busy}>{busy && <Loader2 className="animate-spin" />}移动</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface EditTarget { kind: 'file' | 'folder' | 'new'; id?: number; name: string; text: string; isPublic?: boolean; sortOrder?: number }

export function EditDialog({ target, onOpenChange, onSave }: {
  target: EditTarget | null; onOpenChange: (o: boolean) => void; onSave: (t: EditTarget) => Promise<unknown>
}) {
  const [form, setForm] = useState<EditTarget | null>(target)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setForm(target); setError('') }, [target])
  if (!form) return null
  const isFolder = form.kind !== 'file'
  const run = async () => {
    if (!form.name.trim()) return setError('名称不能为空')
    setBusy(true)
    try { await onSave({ ...form, name: form.name.trim() }); onOpenChange(false) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{form.kind === 'new' ? '新建文件夹' : isFolder ? '编辑文件夹' : '编辑文件'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label="名称"><Input autoFocus value={form.name} maxLength={180} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={isFolder ? '描述' : '备注'} hint={isFolder ? '显示在前台文件中心' : '显示在文件名下方，例如版本说明、安装提示'}>
            <Textarea rows={3} value={form.text} maxLength={isFolder ? 500 : 1000} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          </Field>
          {isFolder && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="公开到文件中心">
                <div className="flex h-9 items-center"><Switch checked={!!form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v })} /></div>
              </Field>
              <Field label="排序权重" hint="越大越靠前">
                <Input type="number" value={form.sortOrder ?? 0} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })} />
              </Field>
            </div>
          )}
        </div>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={run} disabled={busy}>{busy && <Loader2 className="animate-spin" />}保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ShareDialog({ target, onOpenChange }: { target: { type: 'file' | 'folder'; id: number; name: string } | null; onOpenChange: (o: boolean) => void }) {
  const [days, setDays] = useState('0')
  const [usePwd, setUsePwd] = useState(false)
  const [pwd, setPwd] = useState('')
  const [max, setMax] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<ShareRow | null>(null)
  useEffect(() => {
    if (target) {
      setCreated(null); setError('')
      setPwd(Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => 'abcdefghjkmnpqrstuvwxyz23456789'[n % 31]).join(''))
    }
  }, [target])
  const cfg = useQuery({ queryKey: ['config'], queryFn: api.config })
  const link = created ? `${cfg.data?.public_url || location.origin}/s/${created.token}` : ''
  const full = created ? `${link}${created.password ? `\n提取码：${created.password}` : ''}` : ''
  const run = async () => {
    if (!target) return
    setBusy(true)
    setError('')
    try {
      setCreated(await api.createShare({
        [target.type === 'file' ? 'file_id' : 'folder_id']: target.id,
        password: usePwd ? pwd : '', expires_days: Number(days), max_downloads: Number(max) || 0,
      }))
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const copy = async (t: string) => toast[(await copyText(t)) ? 'success' : 'error']('已复制')
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建分享</DialogTitle>
          <DialogDescription className="break-all">{target?.type === 'folder' ? '📁 ' : ''}{target?.name}</DialogDescription>
        </DialogHeader>
        {!created ? (
          <div className="space-y-4">
            <Field label="有效期">
              <NativeSelect value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="1">1 天</option><option value="7">7 天</option><option value="30">30 天</option><option value="0">永久有效</option>
              </NativeSelect>
            </Field>
            <Field label="提取码">
              <div className="flex items-center gap-3">
                <Switch checked={usePwd} onCheckedChange={setUsePwd} />
                {usePwd && <Input className="w-40" value={pwd} maxLength={32} onChange={(e) => setPwd(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} />}
              </div>
            </Field>
            <Field label="最多下载次数" hint="留空表示不限"><Input type="number" min={0} value={max} onChange={(e) => setMax(e.target.value)} /></Field>
            <ErrorBox error={error} />
            <DialogFooter><Button onClick={run} disabled={busy}>{busy && <Loader2 className="animate-spin" />}创建分享链接</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea readOnly rows={2} value={full} />
            <DialogFooter>
              <Button variant="outline" onClick={() => copy(link)}><Copy />仅复制链接</Button>
              <Button onClick={() => copy(full)}><Copy />复制链接和提取码</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface OrderItem { id: number; name: string; size?: number; created_at?: string }
type OrderKind = 'folders' | 'files'

/** Drag (or arrow-button) ordering of one folder's subfolders and files. */
export function ReorderDialog({ open, onOpenChange, title, folders, files, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string
  folders: OrderItem[]; files: OrderItem[]; onSaved: () => void
}) {
  const [lists, setLists] = useState<Record<OrderKind, OrderItem[]>>({ folders: [], files: [] })
  const [drag, setDrag] = useState<{ kind: OrderKind; index: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setLists({ folders: [...folders], files: [...files] }); setError('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (kind: OrderKind, from: number, to: number) => setLists((l) => {
    if (to < 0 || to >= l[kind].length || from === to) return l
    const arr = [...l[kind]]
    const [it] = arr.splice(from, 1)
    arr.splice(to, 0, it)
    return { ...l, [kind]: arr }
  })
  const byName = (a: OrderItem, b: OrderItem) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
  const sorts = {
    name: byName,
    time: (a: OrderItem, b: OrderItem) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    size: (a: OrderItem, b: OrderItem) => (b.size ?? 0) - (a.size ?? 0),
  }
  const sortAll = (by: keyof typeof sorts) => setLists((l) => ({
    folders: [...l.folders].sort(by === 'size' ? byName : sorts[by]), files: [...l.files].sort(sorts[by]),
  }))
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await api.reorder({ folder_ids: lists.folders.map((f) => f.id), file_ids: lists.files.map((f) => f.id) })
      toast.success('顺序已保存')
      onSaved()
      onOpenChange(false)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>拖动 <GripVertical className="inline h-3.5 w-3.5" /> 或用箭头调整顺序，保存后前台文件中心与分享页同步生效。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">快速排序：</span>
          <Button size="sm" variant="outline" onClick={() => sortAll('name')}>按名称</Button>
          <Button size="sm" variant="outline" onClick={() => sortAll('time')}>最新在前</Button>
          <Button size="sm" variant="outline" onClick={() => sortAll('size')}>最大在前</Button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
          {(['folders', 'files'] as const).map((kind) => lists[kind].length > 0 && (
            <div key={kind}>
              <div className="sticky top-0 z-10 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{kind === 'folders' ? '文件夹' : '文件'}（{lists[kind].length}）</div>
              {lists[kind].map((it, i) => (
                <div
                  key={it.id} draggable
                  onDragStart={() => setDrag({ kind, index: i })}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (drag && drag.kind === kind && drag.index !== i) { move(kind, drag.index, i); setDrag({ kind, index: i }) }
                  }}
                  onDrop={(e) => e.preventDefault()}
                  className={cn('flex items-center gap-2 border-t bg-card px-2 py-1.5 text-sm', drag?.kind === kind && drag.index === i && 'bg-primary/10 opacity-70')}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                  <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                  <span className="flex-1 truncate">{kind === 'folders' ? '📁 ' : ''}{it.name}</span>
                  {kind === 'files' && <span className="hidden text-xs text-muted-foreground sm:inline">{formatBytes(it.size ?? 0)}</span>}
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="置顶" disabled={i === 0} onClick={() => move(kind, i, 0)}><ArrowUpToLine /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="上移" disabled={i === 0} onClick={() => move(kind, i, i - 1)}><ArrowUp /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="下移" disabled={i === lists[kind].length - 1} onClick={() => move(kind, i, i + 1)}><ArrowDown /></Button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}保存顺序</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
