'use client'

import { formatCurrency } from '@/lib/utils'

interface BudgetPacingProps {
  budget: number        // orçamento total do período (R$)
  spend: number         // gasto até hoje no período
  dateFrom: string      // YYYY-MM-DD
  dateTo: string        // YYYY-MM-DD
}

export function BudgetPacing({ budget, spend, dateFrom, dateTo }: BudgetPacingProps) {
  const today = new Date()
  const from = new Date(dateFrom + 'T00:00:00')
  const to = new Date(dateTo + 'T00:00:00')

  const totalDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1)
  const elapsedDays = Math.max(1, Math.min(totalDays, Math.round((today.getTime() - from.getTime()) / 86_400_000) + 1))
  const remainingDays = Math.max(0, totalDays - elapsedDays)

  const pct = Math.min(100, budget > 0 ? (spend / budget) * 100 : 0)
  const expectedPct = (elapsedDays / totalDays) * 100
  const dailyActual = elapsedDays > 0 ? spend / elapsedDays : 0
  const projected = dailyActual * totalDays
  const projectedDiff = budget > 0 ? ((projected - budget) / budget) * 100 : 0

  const isOverPace = spend > (budget * elapsedDays) / totalDays * 1.05
  const isUnderPace = spend < (budget * elapsedDays) / totalDays * 0.95

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Ritmo de Orçamento</h3>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isOverPace
              ? 'bg-red-100 text-red-700'
              : isUnderPace
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-green-100 text-green-700'
          }`}
        >
          {isOverPace ? 'Acelerado' : isUnderPace ? 'Lento' : 'No ritmo'}
        </span>
      </div>

      {/* Barra de progresso dupla: esperado vs real */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Gasto: {formatCurrency(spend)}</span>
          <span>Meta: {formatCurrency(budget)}</span>
        </div>
        <div className="relative h-3 w-full rounded-full bg-muted overflow-hidden">
          {/* Esperado (cinza claro) */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20"
            style={{ width: `${expectedPct}%` }}
          />
          {/* Real */}
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all ${
              isOverPace ? 'bg-red-500' : isUnderPace ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{pct.toFixed(0)}% gasto</span>
          <span>{elapsedDays}d de {totalDays}d · {remainingDays}d restantes</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 pt-1 border-t">
        <div>
          <p className="text-[10px] text-muted-foreground">Ritmo atual</p>
          <p className="text-sm font-semibold">{formatCurrency(dailyActual)}<span className="text-xs font-normal text-muted-foreground">/dia</span></p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Projeção final</p>
          <p className={`text-sm font-semibold ${isOverPace ? 'text-red-600' : isUnderPace ? 'text-amber-600' : 'text-green-600'}`}>
            {formatCurrency(projected)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Vs orçamento</p>
          <p className={`text-sm font-semibold ${projectedDiff > 5 ? 'text-red-600' : projectedDiff < -5 ? 'text-amber-600' : 'text-green-600'}`}>
            {projectedDiff > 0 ? '+' : ''}{projectedDiff.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  )
}
