import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TableCell, TableRow } from '@/components/ui/table'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ title, value, icon, hint, trend, trendLabel, tone, onClick }: {
  title: string; value: ReactNode; icon: ReactNode; hint?: ReactNode
  trend?: number | null; trendLabel?: string; tone?: 'default' | 'warning' | 'danger'; onClick?: () => void
}) {
  return (
    <Card
      onClick={onClick}
      className={cn('p-5 transition-shadow', onClick && 'cursor-pointer hover:shadow-md',
        tone === 'warning' && 'border-warning/50', tone === 'danger' && 'border-destructive/50')}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className={cn('text-muted-foreground [&_svg]:h-4 [&_svg]:w-4', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-destructive')}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        {trend !== undefined && trend !== null && (
          <span className={cn('inline-flex items-center gap-0.5 font-medium', trend >= 0 ? 'text-success' : 'text-destructive')}>
            {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
        )}
        {trend !== undefined && trendLabel && <span>{trendLabel}</span>}
        {hint && <span>{hint}</span>}
      </div>
    </Card>
  )
}

export function Pagination({ page, perPage, total, onChange }: { page: number; perPage: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm text-muted-foreground">
      <span>共 {total} 条</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft /></Button>
        <span className="tabular-nums">{page} / {pages}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight /></Button>
      </div>
    </div>
  )
}

export function EmptyRow({ cols, loading, text = '暂无数据' }: { cols: number; loading?: boolean; text?: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={cols} className="py-10 text-center text-muted-foreground">
        {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : text}
      </TableCell>
    </TableRow>
  )
}

export function ErrorBox({ error }: { error?: string }) {
  return error ? <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Confirmation dialog; with `typeToConfirm` the user must type that exact text. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmText = '确认', destructive, typeToConfirm, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode
  confirmText?: string; destructive?: boolean; typeToConfirm?: string; onConfirm: () => Promise<unknown>
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = (o: boolean) => {
    if (!o) { setTyped(''); setError('') }
    onOpenChange(o)
  }
  const run = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
      close(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
        </DialogHeader>
        {typeToConfirm && (
          <Field label={`请输入 ${typeToConfirm} 以确认`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
        )}
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>取消</Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={busy || (!!typeToConfirm && typed.trim().toLowerCase() !== typeToConfirm.toLowerCase())} onClick={run}>
            {busy && <Loader2 className="animate-spin" />}{confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
