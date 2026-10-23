import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type AdminUser, type Me } from '@/lib/api'
import { formatBytes, formatTime, randomPassword } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog, EmptyRow, ErrorBox, Field, PageHeader, Pagination } from '@/components/common'
import { Bar } from '@/components/UploadPanel'

type Form = { id?: number; username: string; password: string; is_admin: boolean; is_active: boolean; quota: string }
const gb = (b: number | null) => (b === null ? '' : String(Math.round((b / 1024 ** 3) * 100) / 100))

function UserDialog({ form, onClose, onSaved }: { form: Form | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form | null>(form)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setF(form); setError('') }, [form])
  if (!f) return null
  const quota = f.quota.trim() === '' ? null : Number(f.quota)
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      if (f.id) await api.updateUser(f.id, { username: f.username, is_admin: f.is_admin, is_active: f.is_active, quota_gb: quota })
      else await api.createUser({ username: f.username, password: f.password, is_admin: f.is_admin, quota_gb: quota })
      toast.success(f.id ? '已保存' : '用户已创建')
      onSaved()
      onClose()
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!form} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{f.id ? '编辑用户' : '新建用户'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label="用户名"><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="off" /></Field>
          {!f.id && (
            <Field label="初始密码" hint="至少 8 位">
              <div className="flex gap-2">
                <Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
                <Button type="button" variant="outline" size="icon" title="生成随机密码" onClick={() => setF({ ...f, password: randomPassword() })}><Wand2 /></Button>
              </div>
            </Field>
          )}
          <Field label="存储配额 (GB)" hint="留空使用系统默认配额；0 表示不限。管理员不受配额限制。">
            <Input type="number" min={0} step="0.5" value={f.quota} onChange={(e) => setF({ ...f, quota: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.is_admin} onCheckedChange={(v) => setF({ ...f, is_admin: v })} />管理员</label>
            {f.id && <label className="flex items-center gap-2 text-sm"><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} />启用</label>}
          </div>
        </div>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={busy || !f.username || (!f.id && f.password.length < 8)}>{busy && <Loader2 className="animate-spin" />}保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Users({ me }: { me: Me }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<Form | null>(null)
  const [pwd, setPwd] = useState<{ user: AdminUser; value: string } | null>(null)
  const [del, setDel] = useState<AdminUser | null>(null)
  const [purge, setPurge] = useState(false)
  const list = useQuery({ queryKey: ['users', search, page], queryFn: () => api.users({ q: search, page }), placeholderData: keepPreviousData })
  const reload = () => qc.invalidateQueries({ queryKey: ['users'] })

  return (
    <>
      <PageHeader title="用户管理" description="普通用户只能管理自己的文件；管理员可管理全部内容"
        actions={<Button onClick={() => setForm({ username: '', password: randomPassword(), is_admin: false, is_active: true, quota: '' })}><Plus />新建用户</Button>} />
      <Card className="p-4">
        <form className="mb-3 flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()) }}>
          <Input placeholder="搜索用户名" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant="outline" type="submit"><Search /></Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead className="w-56">存储</TableHead>
              <TableHead className="hidden md:table-cell">最近登录</TableHead>
              <TableHead className="hidden lg:table-cell">创建时间</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.data.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {u.username}
                    {u.is_admin && <Badge>管理员</Badge>}
                    {!u.is_active && <Badge variant="destructive">已停用</Badge>}
                    {u.id === me.id && <Badge variant="muted">我</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{u.files} 个文件</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm tabular-nums">{formatBytes(u.used)} / {u.effective_quota ? formatBytes(u.effective_quota) : '不限'}</div>
                  {u.effective_quota > 0 && <Bar className="mt-1" value={(u.used / u.effective_quota) * 100} tone={u.used / u.effective_quota > 0.9 ? 'danger' : 'default'} />}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatTime(u.last_login_at)}{u.last_login_ip && <div className="text-xs">{u.last_login_ip}</div>}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{formatTime(u.created_at)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setForm({ id: u.id, username: u.username, password: '', is_admin: u.is_admin, is_active: u.is_active, quota: gb(u.quota_bytes) })}><Pencil />编辑</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPwd({ user: u, value: randomPassword() })}><KeyRound />重置密码</DropdownMenuItem>
                      {u.id !== me.id && (<><DropdownMenuSeparator /><DropdownMenuItem destructive onSelect={() => { setPurge(false); setDel(u) }}><Trash2 />删除用户</DropdownMenuItem></>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {!list.data?.data.length && <EmptyRow cols={5} loading={list.isLoading} />}
          </TableBody>
        </Table>
        {list.data && <Pagination page={list.data.page} perPage={list.data.per_page} total={list.data.total} onChange={setPage} />}
      </Card>

      <UserDialog form={form} onClose={() => setForm(null)} onSaved={reload} />
      <Dialog open={!!pwd} onOpenChange={(o) => !o && setPwd(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>重置「{pwd?.user.username}」的密码</DialogTitle></DialogHeader>
          <Field label="新密码" hint="重置后该用户所有已登录的会话会失效">
            <div className="flex gap-2">
              <Input value={pwd?.value ?? ''} onChange={(e) => pwd && setPwd({ ...pwd, value: e.target.value })} />
              <Button variant="outline" size="icon" onClick={() => pwd && setPwd({ ...pwd, value: randomPassword() })}><Wand2 /></Button>
            </div>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwd(null)}>取消</Button>
            <Button disabled={(pwd?.value.length ?? 0) < 8} onClick={async () => {
              try { await api.resetPassword(pwd!.user.id, pwd!.value); toast.success('密码已重置，请把新密码告知用户'); setPwd(null) } catch (e) { toast.error(errorMessage(e)) }
            }}>重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} destructive title={`删除用户 ${del?.username}`} confirmText="删除" typeToConfirm={del?.username}
        description={
          <div className="space-y-3">
            <p>该用户的分享会转移给你。</p>
            <div className="flex items-center gap-2"><Checkbox id="purge" checked={purge} onCheckedChange={(v) => setPurge(!!v)} /><Label htmlFor="purge">同时永久删除该用户的全部文件（不勾选则文件转移给你）</Label></div>
          </div>
        }
        onConfirm={async () => {
          try { await api.deleteUser(del!.id, purge) } catch (e) { throw new Error(errorMessage(e)) }
          toast.success('用户已删除')
          reload()
        }} />
    </>
  )
}
