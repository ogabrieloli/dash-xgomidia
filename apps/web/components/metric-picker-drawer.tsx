'use client'

import { useState } from 'react'
import { X, GripVertical, ArrowUp, ArrowDown, Check, SlidersHorizontal } from 'lucide-react'
import { METRIC_OPTIONS } from '@/components/dashboard-builder'

const GROUP_LABELS: Record<string, string> = {
  universal: 'Universais',
  lead: 'LEAD',
  sales: 'SALES',
  branding: 'BRANDING',
}

interface MetricPickerDrawerProps {
  title: string
  selected: string[]
  onChange: (metrics: string[]) => void
  onClose: () => void
  minItems?: number
  maxItems?: number
  /** Restringe métricas disponíveis a esses grupos. Se vazio, mostra todos. */
  groups?: string[]
}

export function MetricPickerDrawer({
  title,
  selected,
  onChange,
  onClose,
  minItems = 1,
  maxItems = 6,
  groups,
}: MetricPickerDrawerProps) {
  const [draft, setDraft] = useState<string[]>(selected)

  const available = groups && groups.length > 0
    ? METRIC_OPTIONS.filter((m) => groups.includes(m.group))
    : METRIC_OPTIONS

  const grouped = available.reduce<Record<string, typeof METRIC_OPTIONS>>((acc, m) => {
    ;(acc[m.group] ??= []).push(m)
    return acc
  }, {})

  function toggle(value: string) {
    if (draft.includes(value)) {
      if (draft.length <= minItems) return
      setDraft(draft.filter((v) => v !== value))
    } else {
      if (draft.length >= maxItems) return
      setDraft([...draft, value])
    }
  }

  function moveUp(i: number) {
    if (i === 0) return
    const next = [...draft]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    setDraft(next)
  }

  function moveDown(i: number) {
    if (i === draft.length - 1) return
    const next = [...draft]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    setDraft(next)
  }

  function handleSave() {
    onChange(draft)
    onClose()
  }

  const atMax = draft.length >= maxItems
  const atMin = draft.length <= minItems

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-full bg-background border-l shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Selected order */}
          <div className="px-5 py-4 border-b bg-muted/20">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Selecionadas ({draft.length}/{maxItems})
            </p>
            {draft.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhuma selecionada</p>
            ) : (
              <div className="space-y-1">
                {draft.map((value, i) => {
                  const opt = METRIC_OPTIONS.find((m) => m.value === value)
                  return (
                    <div
                      key={value}
                      className="flex items-center gap-2 rounded-md bg-background border px-2.5 py-1.5 group"
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                      <span className="flex-1 text-xs font-medium text-foreground truncate">
                        {opt?.label ?? value}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveUp(i)}
                          disabled={i === 0}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => moveDown(i)}
                          disabled={i === draft.length - 1}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => toggle(value)}
                        disabled={atMin}
                        className="p-0.5 rounded text-muted-foreground hover:text-destructive disabled:opacity-20 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Available metrics by group */}
          <div className="px-5 py-4 space-y-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Disponíveis
              {atMax && <span className="ml-2 font-normal text-amber-600">· limite de {maxItems} atingido</span>}
            </p>
            {Object.entries(grouped).map(([group, metrics]) => (
              <div key={group}>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-1.5">
                  {GROUP_LABELS[group] ?? group}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {metrics.map((m) => {
                    const isSelected = draft.includes(m.value)
                    const disabled = !isSelected && atMax
                    return (
                      <button
                        key={m.value}
                        onClick={() => toggle(m.value)}
                        disabled={disabled}
                        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5 text-foreground font-medium'
                            : disabled
                            ? 'border-border/50 bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent'
                        }`}
                      >
                        <span
                          className={`flex-shrink-0 h-3.5 w-3.5 rounded-sm border flex items-center justify-center transition-colors ${
                            isSelected ? 'border-primary bg-primary' : 'border-border'
                          }`}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        </span>
                        <span className="truncate">{m.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center gap-2 bg-background">
          <button
            onClick={handleSave}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Aplicar
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  )
}
