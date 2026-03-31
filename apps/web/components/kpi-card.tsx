import { cn } from '@/lib/utils'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  change?: number   // % de variação vs período anterior (ex: 12.3 = +12.3%)
  loading?: boolean
}

export function KpiCard({ label, value, sub, change, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-4 space-y-2 animate-pulse">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-7 w-32 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
      </div>
    )
  }

  const isPositive = change !== undefined && change > 0
  const isNegative = change !== undefined && change < 0
  const isNeutral = change !== undefined && change === 0

  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>

      <div className="flex items-center gap-2">
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}

        {change !== undefined && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium',
              isPositive && 'text-green-600',
              isNegative && 'text-destructive',
              isNeutral && 'text-muted-foreground',
            )}
          >
            {isPositive && <TrendingUp className="h-3 w-3" />}
            {isNegative && <TrendingDown className="h-3 w-3" />}
            {isNeutral && <Minus className="h-3 w-3" />}
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}
