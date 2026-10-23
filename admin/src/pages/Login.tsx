import { useState, type FormEvent } from 'react'
import { HardDrive, Loader2 } from 'lucide-react'
import { api, errorMessage, type Me } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ErrorBox, Field } from '@/components/common'

export default function Login({ onLogin }: { onLogin: (me: Me) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const me = await api.login(username.trim(), password)
      if (!me.is_admin) {
        await api.logout().catch(() => {})
        setError('该账号不是管理员')
        return
      }
      onLogin(me)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><HardDrive className="h-5 w-5" /></div>
          <CardTitle className="text-xl">网盘管理后台</CardTitle>
          <CardDescription>使用管理员账号登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label="用户名"><Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
            <Field label="密码"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <ErrorBox error={error} />
            <Button type="submit" className="w-full" disabled={busy || !username || !password}>{busy && <Loader2 className="animate-spin" />}登录</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
