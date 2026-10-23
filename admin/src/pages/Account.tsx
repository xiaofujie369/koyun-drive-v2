import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ErrorBox, Field, PageHeader } from '@/components/common'

export default function Account() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.next.length < 8) return setError('新密码至少 8 位')
    if (form.next !== form.confirm) return setError('两次输入的新密码不一致')
    setBusy(true)
    try {
      await api.changePassword(form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      toast.success('密码已修改')
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="修改密码" description="修改后其他设备上的登录会失效" />
      <Card className="max-w-md">
        <CardHeader><CardTitle>登录密码</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <Field label="当前密码"><Input type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></Field>
            <Field label="新密码"><Input type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></Field>
            <Field label="确认新密码"><Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
            <ErrorBox error={error} />
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}保存</Button>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
