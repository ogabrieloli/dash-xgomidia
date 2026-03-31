'use client'

import { useQuery } from '@tanstack/react-query'
import { FileText, Presentation, Download, Loader2, CheckCircle, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Report {
  id: string
  title: string
  type: 'PDF' | 'PPT' | 'WEB'
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR'
  generatedAt: string | null
  createdAt: string
}

interface MeResponse {
  accessibleClients: { id: string; name: string }[]
}

const STATUS_LABEL: Record<Report['status'], string> = {
  PENDING: 'Aguardando',
  PROCESSING: 'Processando',
  DONE: 'Pronto',
  ERROR: 'Erro',
}

export default function ClientPortalReports() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get<{ data: MeResponse }>('/auth/me')
      return res.data.data
    },
  })

  const clientId = me?.accessibleClients[0]?.id

  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const res = await api.get<{ data: Report[] }>('/api/reports', {
        params: { clientId },
      })
      return res.data.data
    },
  })

  async function handleDownload(report: Report) {
    if (report.status !== 'DONE' || !clientId) return
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Relatórios gerados pela sua agência</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      ) : !reports || reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum relatório disponível ainda
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Sua agência gerará relatórios aqui quando disponíveis
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.filter((r) => r.status === 'DONE').map((report) => {
            const TypeIcon = report.type === 'PPT' ? Presentation : FileText
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
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn(
                    'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border',
                    'text-green-600 bg-green-50 border-green-200',
                  )}>
                    <CheckCircle className="h-3 w-3" />
                    {STATUS_LABEL[report.status]}
                  </span>

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
                    Baixar
                  </button>
                </div>
              </div>
            )
          })}

          {/* Relatórios em processamento */}
          {reports.filter((r) => r.status !== 'DONE').map((report) => (
            <div
              key={report.id}
              className="flex items-center gap-3 rounded-lg border border-dashed bg-card px-4 py-3 opacity-60"
            >
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{report.title}</p>
                <p className="text-xs text-muted-foreground/60">{STATUS_LABEL[report.status]}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
