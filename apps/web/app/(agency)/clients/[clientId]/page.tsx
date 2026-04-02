'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, FolderOpen, Pencil, X, ChevronDown, ChevronRight, LayoutDashboard } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FUNNEL_TYPES } from '@xgo/shared-types'
import { PlatformsSection } from '@/components/platforms-section'
import { InsightsPanel } from '@/components/insights-panel'
import { TimelineFeed } from '@/components/timeline-feed'

interface Strategy {
  id: string
  name: string
  funnelType: string
  objective: string | null
}

interface Project {
  id: string
  name: string
  description: string | null
  strategies: Strategy[]
}

interface AdAccount {
  id: string
  platform: string
  name: string
  syncStatus: string
}

interface Client {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  operation: string | null
  projects: Project[]
  adAccounts: AdAccount[]
}

const CreateProjectSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  description: z.string().max(500).optional(),
})
type CreateProjectForm = z.infer<typeof CreateProjectSchema>

const CreateStrategySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  funnelType: z.enum(Object.values(FUNNEL_TYPES) as [string, ...string[]]),
  objective: z.string().max(500).optional(),
})
type CreateStrategyForm = z.infer<typeof CreateStrategySchema>

const FUNNEL_LABELS: Record<string, string> = {
  WEBINAR: 'Webinário',
  DIRECT_SALE: 'Venda Direta',
  LEAD_GENERATION: 'Geração de Leads',
  ECOMMERCE: 'E-commerce',
  CUSTOM: 'Personalizado',
}

const FUNNEL_COLORS: Record<string, string> = {
  WEBINAR: 'bg-purple-500/10 text-purple-700',
  DIRECT_SALE: 'bg-green-500/10 text-green-700',
  LEAD_GENERATION: 'bg-blue-500/10 text-blue-700',
  ECOMMERCE: 'bg-orange-500/10 text-orange-700',
  CUSTOM: 'bg-muted text-muted-foreground',
}

function ClientAvatar({ name, logoUrl, size = 'md' }: { name: string; logoUrl: string | null; size?: 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-16 w-16 text-2xl' : 'h-10 w-10 text-base'
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover border border-border flex-shrink-0`}
      />
    )
  }
  return (
    <div className={`${sizeClass} rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary flex-shrink-0`}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const metaPendingId = searchParams.get('meta_pending')
  const queryClient = useQueryClient()

  const [showProjectForm, setShowProjectForm] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [showStrategyForm, setShowStrategyForm] = useState<string | null>(null)
  const [editLogoOpen, setEditLogoOpen] = useState(false)
  const [logoInput, setLogoInput] = useState('')

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
      const res = await api.post<{ data: { id: string } }>('/api/strategies', {
        ...data,
        projectId,
        clientId,
        metricConfig: {},
      })
      return res.data.data
    },
    onSuccess: (strategy) => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] })
      setShowStrategyForm(null)
      strategyForm.reset()
      router.push(`/clients/${clientId}/strategies/${strategy.id}`)
    },
  })

  const updateLogoMutation = useMutation({
    mutationFn: async (logoUrl: string) => {
      await api.patch(`/api/clients/${clientId}`, { logoUrl: logoUrl || null })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setEditLogoOpen(false)
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
      <div className="p-8 max-w-4xl">
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

  const totalStrategies = client.projects.reduce((sum, p) => sum + (p.strategies?.length ?? 0), 0)

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="text-xs text-muted-foreground mb-4">
        <Link href="/clients" className="hover:underline">Clientes</Link>
        <span className="mx-1">/</span>
        <span>{client.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="relative group">
          <ClientAvatar name={client.name} logoUrl={client.logoUrl} size="lg" />
          <button
            onClick={() => { setLogoInput(client.logoUrl ?? ''); setEditLogoOpen(true) }}
            className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            title="Editar logo"
          >
            <Pencil className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
          <p className="text-sm text-muted-foreground">/{client.slug}</p>
          {client.operation && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{client.operation}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>{client.adAccounts.length} plataforma{client.adAccounts.length !== 1 ? 's' : ''} conectada{client.adAccounts.length !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{totalStrategies} estratégia{totalStrategies !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <button
          onClick={() => setShowProjectForm(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          Novo projeto
        </button>
      </div>

      {/* Modal editar logo */}
      {editLogoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Editar logo</h3>
              <button onClick={() => setEditLogoOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              {logoInput ? (
                <img src={logoInput} alt="Preview" className="h-12 w-12 rounded-full object-cover border" onError={() => setLogoInput('')} />
              ) : (
                <div className="h-12 w-12 rounded-full bg-muted border border-dashed border-input flex items-center justify-center text-xs text-muted-foreground">Logo</div>
              )}
              <input
                type="url"
                value={logoInput}
                onChange={(e) => setLogoInput(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="https://exemplo.com/logo.png"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => updateLogoMutation.mutate(logoInput)}
                disabled={updateLogoMutation.isPending}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {updateLogoMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditLogoOpen(false)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plataformas conectadas */}
      <PlatformsSection clientId={clientId} pendingId={metaPendingId} />

      {/* Projetos & Estratégias */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Projetos & Estratégias</h2>
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
                  <p className="text-xs text-destructive mt-1">{projectForm.formState.errors.name.message}</p>
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

        {client.projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-dashed bg-card">
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
              <div key={project.id} className="rounded-xl border bg-card overflow-hidden">
                {/* Project header */}
                <button
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/50 transition-colors"
                  onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
                >
                  <div className="text-left">
                    <p className="font-semibold text-foreground text-sm">{project.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {project.strategies?.length ?? 0} estratégia{(project.strategies?.length ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {expandedProject === project.id
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  }
                </button>

                {/* Strategies */}
                {expandedProject === project.id && (
                  <div className="border-t bg-muted/20 px-5 py-4">
                    {/* Strategy cards grid */}
                    {(project.strategies?.length ?? 0) > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {project.strategies?.map((strategy) => (
                          <Link
                            key={strategy.id}
                            href={`/clients/${clientId}/strategies/${strategy.id}`}
                            className="group rounded-lg border bg-card p-4 hover:shadow-sm hover:border-primary/30 transition-all flex flex-col gap-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-foreground text-sm leading-tight">{strategy.name}</p>
                              <span className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0',
                                FUNNEL_COLORS[strategy.funnelType] ?? 'bg-muted text-muted-foreground',
                              )}>
                                {FUNNEL_LABELS[strategy.funnelType] ?? strategy.funnelType}
                              </span>
                            </div>
                            {strategy.objective && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{strategy.objective}</p>
                            )}
                            <div className="flex items-center gap-1 text-xs text-primary mt-auto group-hover:gap-2 transition-all">
                              <LayoutDashboard className="h-3.5 w-3.5" />
                              <span>Ver dashboard</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Formulário nova estratégia */}
                    {showStrategyForm === project.id ? (
                      <form
                        onSubmit={strategyForm.handleSubmit((data) =>
                          strategyMutation.mutate({ ...data, projectId: project.id }),
                        )}
                        className="space-y-3 rounded-lg border bg-background p-3"
                      >
                        <p className="text-xs font-semibold text-foreground">Nova estratégia</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Nome da estratégia *"
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
                        </div>
                        <textarea
                          placeholder="Objetivo principal (opcional)"
                          rows={2}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                          {...strategyForm.register('objective')}
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={strategyMutation.isPending}
                            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {strategyMutation.isPending ? 'Criando...' : 'Criar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowStrategyForm(null); strategyForm.reset() }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setShowStrategyForm(project.id)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Nova estratégia
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Insights automáticos */}
      <InsightsPanel clientId={clientId} />

      {/* Linha do Tempo */}
      <TimelineFeed clientId={clientId} />
    </div>
  )
}
