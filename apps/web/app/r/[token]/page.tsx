/**
 * Página pública de relatório compartilhado.
 * Acessível sem login — segurança via shareToken de 64 chars + expiração.
 */
'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { FileText, Presentation, Download, AlertCircle, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import axios from 'axios'

interface SharedReport {
  id: string
  title: string
  type: 'PDF' | 'PPT' | 'WEB'
  clientName: string
  generatedAt: string | null
  expiresAt: string
  downloadUrl: string
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export default function SharedReportPage() {
  const { token } = useParams<{ token: string }>()

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['shared-report', token],
    queryFn: async () => {
      const res = await axios.get<{ data: SharedReport }>(`${API_URL}/r/${token}`)
      return res.data.data
    },
    retry: false,
  })

  const TypeIcon = report?.type === 'PPT' ? Presentation : FileText

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm">Carregando relatório...</p>
        </div>
      </div>
    )
  }

  if (error) {
    const isExpired = axios.isAxiosError(error) && error.response?.status === 410
    const isNotFound = axios.isAxiosError(error) && error.response?.status === 404

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full rounded-xl border bg-white p-8 text-center shadow-sm">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-foreground mb-2">
            {isExpired ? 'Link expirado' : isNotFound ? 'Link não encontrado' : 'Erro ao carregar'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isExpired
              ? 'Este link de compartilhamento expirou. Solicite ao responsável um novo link.'
              : isNotFound
              ? 'Este link não existe ou já foi revogado.'
              : 'Ocorreu um erro ao carregar o relatório. Tente novamente.'}
          </p>
        </div>
      </div>
    )
  }

  if (!report) return null

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Header da agência */}
        <div className="flex items-center justify-center mb-8">
          <span className="text-xl font-bold text-slate-800">XGO Midia</span>
        </div>

        {/* Card do relatório */}
        <div className="rounded-xl border bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <TypeIcon className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground leading-tight">{report.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{report.clientName}</p>
            </div>
          </div>

          <div className="space-y-2 mb-6 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span className="font-medium">{report.type === 'PDF' ? 'PDF' : 'Apresentação (PPT)'}</span>
            </div>
            {report.generatedAt && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gerado em</span>
                <span className="font-medium">
                  {format(new Date(report.generatedAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Link expira em
              </span>
              <span className="font-medium text-amber-600">
                {format(new Date(report.expiresAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          </div>

          <a
            href={report.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Download className="h-4 w-4" />
            Baixar {report.type === 'PDF' ? 'PDF' : 'Apresentação'}
          </a>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Este link é para uso pessoal. Não compartilhe com terceiros não autorizados.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Relatório gerado por{' '}
          <span className="font-medium text-foreground">XGO Midia</span>
        </p>
      </div>
    </div>
  )
}
