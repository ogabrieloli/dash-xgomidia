'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  FileText,
  Presentation,
  Plus,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Report {
  id: string
  title: string
  type: 'PDF' | 'PPT' | 'WEB'
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR'
  generatedAt: string | null
  errorMessage: string | null
  createdAt: string
}

const CreateReportSchema = z.object({
  title: z.string().min(2).max(200).trim(),
  type: z.enum(['PDF', 'PPT']),
})
type CreateReportForm = z.infer<typeof CreateReportSchema>

const STATUS_CONFIG = {
  PENDING: {
    icon: Clock,
    label: 'Aguardando',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  PROCESSING: {
    icon: Loader2,
    label: 'Processando',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    spin: true,
  },
  DONE: {
    icon: CheckCircle,
    label: 'Pronto',
    color: 'text-green-600 bg-green-50 border-green-200',
  },
  ERROR: {
    icon: XCircle,
    label: 'Erro',
    color: 'text-red-600 bg-red-50 border-red-200',
  },
}

const TYPE_ICON = {
  PDF: FileText,
  PPT: Presentation,
  WEB: FileText,
}

export default function ReportsPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports', clientId],
    queryFn: async () => {
      const res = await api.get<{ data: Report[] }>('/api/reports', {
        params: { clientId },
      })
      return res.data.data
    },
    // Polling enquanto há relatórios em processamento
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const hasPending = data.some((r) => r.status === 'PENDING' || r.status === 'PROCESSING')
      return hasPending ? 5000 : false
    },
  })

  const form = useForm<CreateReportForm>({
    resolver: zodResolver(CreateReportSchema),
    defaultValues: { type: 'PDF' },
  })

  const createMutation = useMutation({
    mutationFn: async (data: CreateReportForm) => {
      await api.post('/api/reports', { ...data, clientId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', clientId] })
      setShowForm(false)
      form.reset()
    },
  })

  async function handleDownload(report: Report) {
    if (report.status !== 'DONE') return
    setDownloadingId(report.id)
    try {
      const res = await api.get<{ data: { url: string } }>(
        `/api/reports/${report.id}/download`,
        { params: { clientId } },
      )
      window.open(res.data.data.url, '_blank')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Gerar relatório
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Novo relatório</h3>
          <form
            onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-3"
          >
            <input
              type="text"
              placeholder="Título do relatório *"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...form.register('title')}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}

            <div className="flex gap-3">
              {(['PDF', 'PPT'] as const).map((type) => {
                const Icon = TYPE_ICON[type]
                return (
                  <label
                    key={type}
                    className={cn(
                      'flex items-center gap-2 cursor-pointer rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                      form.watch('type') === type
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-input hover:bg-accent',
                    )}
                  >
                    <input
                      type="radio"
                      value={type}
                      className="sr-only"
                      {...form.register('type')}
                    />
                    <Icon className="h-4 w-4" />
                    {type === 'PDF' ? 'PDF' : 'Apresentação (PPT)'}
                  </label>
                )
              })}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Gerando...' : 'Gerar'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); form.reset() }}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      ) : !reports || reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum relatório gerado</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Gerar primeiro relatório
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const statusConfig = STATUS_CONFIG[report.status]
            const StatusIcon = statusConfig.icon
            const TypeIcon = TYPE_ICON[report.type]
            const isDownloading = downloadingId === report.id

            return (
              <div
                key={report.id}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TypeIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{report.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {report.type}
                      {' · '}
                      {formatDistanceToNow(new Date(report.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                      {report.errorMessage && (
                        <span className="text-destructive ml-2">— {report.errorMessage}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                      statusConfig.color,
                    )}
                  >
                    <StatusIcon
                      className={cn(
                        'h-3 w-3',
                        'spin' in statusConfig && statusConfig.spin && 'animate-spin',
                      )}
                    />
                    {statusConfig.label}
                  </span>

                  {report.status === 'DONE' && (
                    <button
                      onClick={() => handleDownload(report)}
                      disabled={isDownloading}
                      className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Download
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
