import { Suspense, lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, setAuthHandlers, type Me } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import AppLayout from '@/components/layout/AppLayout'
import UploadPanel from '@/components/UploadPanel'
import Login from '@/pages/Login'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Browser = lazy(() => import('@/pages/Browser'))
const Files = lazy(() => import('@/pages/Files'))
const Shares = lazy(() => import('@/pages/Shares'))
const Uploads = lazy(() => import('@/pages/Uploads'))
const Users = lazy(() => import('@/pages/Users'))
const Logs = lazy(() => import('@/pages/Logs'))
const Settings = lazy(() => import('@/pages/Settings'))
const System = lazy(() => import('@/pages/System'))
const Account = lazy(() => import('@/pages/Account'))

const Spinner = () => <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>

export default function App() {
  useTheme()
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const queryClient = useQueryClient()

  const signedOut = (message?: string) => {
    queryClient.clear()
    setMe((m) => {
      if (m && message) toast.warning(message)
      return null
    })
  }

  useEffect(() => {
    setAuthHandlers({ unauthorized: signedOut })
    api.me().then((u) => setMe(u && u.is_admin ? u : null)).catch(() => setMe(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (me === undefined) return <Spinner />
  if (me === null) return <Login onLogin={setMe} />

  const logout = async () => {
    await api.logout().catch(() => {})
    signedOut()
  }

  return (
    <>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<AppLayout username={me.username} onLogout={logout} />}>
            <Route index element={<Dashboard />} />
            <Route path="browser" element={<Browser />} />
            <Route path="files" element={<Files />} />
            <Route path="shares" element={<Shares />} />
            <Route path="uploads" element={<Uploads />} />
            <Route path="users" element={<Users me={me} />} />
            <Route path="logs/:kind" element={<Logs />} />
            <Route path="settings" element={<Settings />} />
            <Route path="system" element={<System />} />
            <Route path="account" element={<Account />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <UploadPanel />
    </>
  )
}
