import { cn } from '@/lib/utils'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  change?: number        // % de variação vs período anterior (ex: 12.3 = +12.3%)
  goal?: number          // valor-alvo numérico (para barra de progresso)
  currentRaw?: number    // valor atual numérico correspondente ao goal
  goalLabel?: string     // ex: "Meta: 3.0x" exibido abaixo da barra
  goalLowerIsBetter?: boolean  // true para CPL/CPA: estar abaixo da meta é bom
  accent?: boolean       // exibe borda esquerda terracota
  loading?: boolean
}

export function KpiCard({ label, value, sub, change, goal, currentRaw, goalLabel, goalLowerIsBetter, accent, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E2D8] shadow-sm px-5 py-4 space-y-2 animate-pulse">
        <div className="h-2.5 w-20 rounded bg-stone-100" />
        <div className="h-8 w-28 rounded bg-stone-100" />
        <div className="h-2.5 w-16 rounded bg-stone-100" />
      </div>
    )
  }

  const isPositive = change !== undefined && change > 0
  const isNegative = change !== undefined && change < 0
  const isNeutral = change !== undefined && change === 0

  // Goal progress bar
  const showGoal = goal !== undefined && currentRaw !== undefined && goal > 0
  let progressPct = 0
  let goalMet = false
  if (showGoal) {
    if (goalLowerIsBetter) {
      progressPct = Math.min(100, (goal / currentRaw!) * 100)
      goalMet = currentRaw! <= goal
    } else {
      progressPct = Math.min(100, (currentRaw! / goal) * 100)
      goalMet = currentRaw! >= goal
    }
  }

  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-[#E8E2D8] shadow-sm px-5 py-4 space-y-1',
        accent && 'border-l-2 border-l-[#C8432A]',
      )}
    >
      <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest">{label}</p>

      <p className="font-display text-3xl font-bold text-stone-900 leading-tight">{value}</p>

      <div className="flex items-center gap-2 flex-wrap">
        {sub && <p className="text-xs text-stone-400">{sub}</p>}

        {change !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-2 py-0.5',
              isPositive && 'bg-green-50 text-green-700',
              isNegative && 'bg-red-50 text-red-700',
              isNeutral && 'bg-stone-100 text-stone-500',
            )}
          >
            {isPositive && <TrendingUp className="h-3 w-3" />}
            {isNegative && <TrendingDown className="h-3 w-3" />}
            {isNeutral && <Minus className="h-3 w-3" />}
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>

      {showGoal && (
        <div className="pt-1.5 space-y-1">
          <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', goalMet ? 'bg-[#C8432A]' : 'bg-amber-400')}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-stone-400">
            {progressPct.toFixed(0)}% da meta
            {goalLabel && ` · ${goalLabel}`}
            {goalMet ? ' ✓' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
