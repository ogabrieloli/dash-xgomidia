'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DateRangeValue {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  className?: string
}

type PresetKey = 'hoje' | '7dias' | '30dias' | 'custom'

const QUICK_PRESETS: { key: PresetKey; label: string; getDates: () => { from: Date; to: Date } }[] = [
  {
    key: 'hoje',
    label: 'Hoje',
    getDates: () => ({ from: new Date(), to: new Date() }),
  },
  {
    key: '7dias',
    label: '7 dias',
    getDates: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    key: '30dias',
    label: '30 dias',
    getDates: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
]

function detectPreset(value: DateRangeValue): PresetKey {
  const today = format(new Date(), 'yyyy-MM-dd')
  const d7 = format(subDays(new Date(), 6), 'yyyy-MM-dd')
  const d30 = format(subDays(new Date(), 29), 'yyyy-MM-dd')
  if (value.from === today && value.to === today) return 'hoje'
  if (value.from === d7 && value.to === today) return '7dias'
  if (value.from === d30 && value.to === today) return '30dias'
  return 'custom'
}

function presetLabel(key: PresetKey, value: DateRangeValue): string {
  if (key === 'hoje') return 'Hoje'
  if (key === '7dias') return 'Últimos 7 dias'
  if (key === '30dias') return 'Últimos 30 dias'
  const from = value.from ? format(new Date(value.from + 'T00:00:00'), 'dd/MM/yy') : '—'
  const to = value.to ? format(new Date(value.to + 'T00:00:00'), 'dd/MM/yy') : '—'
  return `${from} → ${to}`
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [activePreset, setActivePreset] = useState<PresetKey>(() => detectPreset(value))
  const [showCalendar, setShowCalendar] = useState(false)
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>({
    from: value.from ? new Date(value.from + 'T00:00:00') : undefined,
    to: value.to ? new Date(value.to + 'T00:00:00') : undefined,
  })
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowCalendar(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleQuickPreset(preset: (typeof QUICK_PRESETS)[number]) {
    const dates = preset.getDates()
    setActivePreset(preset.key)
    setPendingRange({ from: dates.from, to: dates.to })
    onChange({ from: format(dates.from, 'yyyy-MM-dd'), to: format(dates.to, 'yyyy-MM-dd') })
    setOpen(false)
    setShowCalendar(false)
  }

  function handleCustomize() {
    setShowCalendar(true)
    // Pre-fill pending range with current value
    setPendingRange({
      from: value.from ? new Date(value.from + 'T00:00:00') : undefined,
      to: value.to ? new Date(value.to + 'T00:00:00') : undefined,
    })
  }

  function handleApply() {
    if (!pendingRange?.from) return
    const from = format(pendingRange.from, 'yyyy-MM-dd')
    const to = pendingRange.to ? format(pendingRange.to, 'yyyy-MM-dd') : from
    setActivePreset('custom')
    onChange({ from, to })
    setOpen(false)
    setShowCalendar(false)
  }

  function handleCancel() {
    setShowCalendar(false)
    if (activePreset !== 'custom') {
      // Revert to current value
      setPendingRange({
        from: value.from ? new Date(value.from + 'T00:00:00') : undefined,
        to: value.to ? new Date(value.to + 'T00:00:00') : undefined,
      })
    }
  }

  const canApply = !!(pendingRange?.from)

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        onClick={() => {
          setOpen((o) => !o)
          if (!open) setShowCalendar(activePreset === 'custom')
        }}
        className={cn(
          'flex items-center gap-2 rounded-xl border border-[#E8E2D8] bg-white px-3.5 py-2',
          'text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors shadow-sm',
        )}
      >
        <CalendarDays className="h-4 w-4 text-[#3B82F6]" />
        <span className="max-w-[200px] truncate">{presetLabel(activePreset, value)}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-stone-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-xl border border-[#E8E2D8] bg-white shadow-xl overflow-hidden"
          style={{ minWidth: 280 }}
        >
          {/* Quick preset pills */}
          <div className="flex items-center gap-1.5 p-3 border-b border-[#F5F0E8]">
            {QUICK_PRESETS.map((preset) => {
              const isActive = activePreset === preset.key
              return (
                <button
                  key={preset.key}
                  onClick={() => handleQuickPreset(preset)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                    isActive
                      ? 'bg-[#3B82F6] text-white shadow-sm'
                      : 'text-stone-600 hover:bg-stone-100',
                  )}
                >
                  {isActive && <Check className="h-3 w-3" />}
                  {preset.label}
                </button>
              )
            })}

            {/* Personalizar pill */}
            <button
              onClick={showCalendar ? handleCancel : handleCustomize}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ml-auto',
                activePreset === 'custom' && !showCalendar
                  ? 'bg-[#3B82F6] text-white shadow-sm'
                  : showCalendar
                  ? 'bg-[#EFF6FF] text-[#3B82F6] border border-[#BFDBFE]'
                  : 'text-stone-600 hover:bg-stone-100',
              )}
            >
              {activePreset === 'custom' && !showCalendar && <Check className="h-3 w-3" />}
              Personalizar
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', showCalendar && 'rotate-180')}
              />
            </button>
          </div>

          {/* Calendar (only in Personalizar mode) */}
          {showCalendar && (
            <div>
              <DayPicker
                mode="range"
                selected={pendingRange}
                onSelect={setPendingRange}
                locale={ptBR}
                numberOfMonths={2}
                className="p-3"
                classNames={{
                  day_selected: 'bg-[#3B82F6] text-white rounded-md',
                  day_range_middle: 'bg-[#EFF6FF] text-[#1D4ED8] rounded-none',
                  day_range_start: 'bg-[#3B82F6] text-white rounded-md',
                  day_range_end: 'bg-[#3B82F6] text-white rounded-md',
                  day_today: 'font-bold text-[#3B82F6]',
                  nav_button: 'hover:bg-stone-100 rounded-lg p-1 transition-colors',
                  caption: 'text-sm font-semibold text-stone-800',
                }}
              />

              {/* Action buttons */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#F5F0E8] bg-[#FAFAF9]">
                <p className="text-xs text-stone-400">
                  {pendingRange?.from && pendingRange?.to
                    ? `${format(pendingRange.from, 'dd/MM/yyyy')} → ${format(pendingRange.to, 'dd/MM/yyyy')}`
                    : pendingRange?.from
                    ? `${format(pendingRange.from, 'dd/MM/yyyy')} → selecione o fim`
                    : 'Selecione o período'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancel}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={!canApply}
                    className={cn(
                      'rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition-all',
                      canApply
                        ? 'bg-[#3B82F6] hover:bg-[#2563EB] shadow-sm'
                        : 'bg-stone-200 text-stone-400 cursor-not-allowed',
                    )}
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
