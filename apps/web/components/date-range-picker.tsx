'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, subWeeks } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DateRangeValue {
  from: string   // YYYY-MM-DD
  to: string     // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  className?: string
}

const PRESETS = [
  { label: 'Hoje',             getDates: () => ({ from: new Date(), to: new Date() }) },
  { label: 'Ontem',            getDates: () => { const y = subDays(new Date(), 1); return { from: y, to: y } } },
  { label: 'Últimos 7 dias',   getDates: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: 'Últimos 14 dias',  getDates: () => ({ from: subDays(new Date(), 13), to: new Date() }) },
  { label: 'Últimos 30 dias',  getDates: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: 'Últimos 90 dias',  getDates: () => ({ from: subDays(new Date(), 89), to: new Date() }) },
  { label: 'Semana atual',     getDates: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: new Date() }) },
  { label: 'Semana anterior',  getDates: () => { const w = subWeeks(new Date(), 1); return { from: startOfWeek(w, { weekStartsOn: 1 }), to: endOfWeek(w, { weekStartsOn: 1 }) } } },
  { label: 'Mês atual',        getDates: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Mês anterior',     getDates: () => { const m = subMonths(new Date(), 1); return { from: startOfMonth(m), to: endOfMonth(m) } } },
]

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>({
    from: value.from ? new Date(value.from + 'T00:00:00') : undefined,
    to: value.to ? new Date(value.to + 'T00:00:00') : undefined,
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(selected: DateRange | undefined) {
    setRange(selected)
    if (selected?.from && selected?.to) {
      onChange({
        from: format(selected.from, 'yyyy-MM-dd'),
        to: format(selected.to, 'yyyy-MM-dd'),
      })
      setOpen(false)
    }
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    const dates = preset.getDates()
    const newRange = { from: dates.from, to: dates.to }
    setRange(newRange)
    onChange({
      from: format(dates.from, 'yyyy-MM-dd'),
      to: format(dates.to, 'yyyy-MM-dd'),
    })
    setOpen(false)
  }

  const displayFrom = value.from
    ? format(new Date(value.from + 'T00:00:00'), "dd/MM/yyyy")
    : '—'
  const displayTo = value.to
    ? format(new Date(value.to + 'T00:00:00'), "dd/MM/yyyy")
    : '—'

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2',
          'text-sm hover:bg-accent transition-colors',
        )}
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span>{displayFrom} → {displayTo}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 flex rounded-lg border bg-popover shadow-lg overflow-hidden">
          {/* Presets */}
          <div className="flex flex-col gap-1 border-r p-3 w-44">
            <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Atalhos</p>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className="text-left rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <DayPicker
            mode="range"
            selected={range}
            onSelect={handleSelect}
            locale={ptBR}
            numberOfMonths={2}
            className="p-3"
            classNames={{
              day_selected: 'bg-primary text-primary-foreground',
              day_range_middle: 'bg-accent',
              day_today: 'font-bold',
              nav_button: 'hover:bg-accent rounded p-1',
            }}
          />
        </div>
      )}
    </div>
  )
}
