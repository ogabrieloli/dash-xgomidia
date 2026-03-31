'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, FolderOpen } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FUNNEL_TYPES } from '@xgo/shared-types'
import { AdAccountsSection } from '@/components/ad-accounts-section'
import { InsightsPanel } from '@/components/insights-panel'
import { TimelineFeed } from '@/components/timeline-feed'

interface Strategy {
  id: string
  name: string
  funnelType: string
}

interface Project {
  id: string
  name: string
  description: string | null
  strategies: Strategy[]
}

interface Client {
  id: string
  name: string
  slug: string
  projects: Project[]
}

const CreateProjectSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  description: z.string().max(500).optional(),
})
type CreateProjectForm = z.infer<typeof CreateProjectSchema>

const CreateStrategySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  funnelType: z.enum(Object.values(FUNNEL_TYPES) as [string, ...string[]]),
})
type CreateStrategyForm = z.infer<typeof CreateStrategySchema>

const FUNNEL_LABELS: Record<string, string> = {
  WEBINAR: 'Webinário',
  DIRECT_SALE: 'Venda Direta',
  LEAD_GENERATION: 'Geração de Leads',
  ECOMMERCE: 'E-commerce',
  CUSTOM: 'Personalizado',
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const queryClient = useQueryClient()
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [showStrategyForm, setShowStrategyForm] = useState<string | null>(null)

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      const res = await api.get<{ data: Client }>(`/api/clients/${clientId}`)
      return res.data.data
    },
  })

  const projectMutation = useMutation({
    mutationFn: async (data: CreateProjectForm) => {
      await api.post('/api/projects', { ...data, clientId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] })
      setShowProjectForm(false)
      projectForm.reset()
    },
  })

  const strategyMutation = useMutation({
    mutationFn: async ({ projectId, ...data }: CreateStrategyForm & { projectId: string }) => {
      await api.post('/api/strategies', { ...data, projectId, clientId, metricConfig: {} })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] })
      setShowStrategyForm(null)
      strategyForm.reset()
    },
  })

  const projectForm = useForm<CreateProjectForm>({
    resolver: zodResolver(CreateProjectSchema),
  })

  const strategyForm = useForm<CreateStrategyForm>({
    resolver: zodResolver(CreateStrategySchema),
    defaultValues: { funnelType: 'WEBINAR' },
  })

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 rounded bg-muted animate-pulse mb-6" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!client) return null

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <nav className="text-xs text-muted-foreground mb-1">
            <Link href="/clients" className="hover:underline">Clientes</Link>
            <span className="mx-1">/</span>
            <span>{client.name}</span>
          </nav>
          <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
          <p className="text-sm text-muted-foreground">/{client.slug}</p>
        </div>
        <button
          onClick={() => setShowProjectForm(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo projeto
        </button>
      </div>

      {/* Formulário novo projeto */}
      {showProjectForm && (
        <div className="mb-4 rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Novo projeto</h3>
          <form
            onSubmit={projectForm.handleSubmit((data) => projectMutation.mutate(data))}
            className="flex items-end gap-3"
          >
            <div className="flex-1">
              <input
                type="text"
                placeholder="Nome do projeto"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...projectForm.register('name')}
              />
              {projectForm.formState.errors.name && (
                <p className="text-xs text-destructive mt-1">
                  {projectForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={projectMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Criar
            </button>
            <button
              type="button"
              onClick={() => setShowProjectForm(false)}
              className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
            >
              Cancelar
            </button>
          </form>
        </div>
      )}

      {/* Projetos */}
      {client.projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum projeto cadastrado</p>
          <button
            onClick={() => setShowProjectForm(true)}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Criar primeiro projeto
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {client.projects.map((project) => (
            <div key={project.id} className="rounded-lg border bg-card overflow-hidden">
              {/* Project header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
                onClick={() =>
                  setExpandedProject(expandedProject === project.id ? null : project.id)
                }
              >
                <div className="text-left">
                  <p className="font-medium text-foreground text-sm">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {project.strategies?.length ?? 0} estratégia{(project.strategies?.length ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">
                  {expandedProject === project.id ? '▲' : '▼'}
                </span>
              </button>

              {/* Strategies */}
              {expandedProject === project.id && (
                <div className="border-t px-4 py-3 bg-muted/20">
                  <div className="space-y-2 mb-3">
                    {project.strategies?.map((strategy) => (
                      <div
                        key={strategy.id}
                        className="flex items-center justify-between rounded-md bg-background border px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{strategy.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {FUNNEL_LABELS[strategy.funnelType] ?? strategy.funnelType}
                          </p>
                        </div>
                        <Link
                          href={`/clients/${clientId}/strategies/${strategy.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Ver dashboard →
                        </Link>
                      </div>
                    ))}
                  </div>

                  {/* Formulário nova estratégia */}
                  {showStrategyForm === project.id ? (
                    <form
                      onSubmit={strategyForm.handleSubmit((data) =>
                        strategyMutation.mutate({ ...data, projectId: project.id }),
                      )}
                      className="flex items-end gap-2"
                    >
                      <input
                        type="text"
                        placeholder="Nome da estratégia"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        {...strategyForm.register('name')}
                      />
                      <select
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        {...strategyForm.register('funnelType')}
                      >
                        {Object.entries(FUNNEL_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={strategyMutation.isPending}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        Criar
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowStrategyForm(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setShowStrategyForm(project.id)}
                      className={cn(
                        'flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors',
                      )}
                    >
                      <Plus className="h-3 w-3" />
                      Nova estratégia
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Contas de Anúncio */}
      <AdAccountsSection clientId={clientId} />

      {/* Insights automáticos */}
      <InsightsPanel clientId={clientId} />

      {/* Linha do Tempo */}
      <TimelineFeed clientId={clientId} />
    </div>
  )
}
