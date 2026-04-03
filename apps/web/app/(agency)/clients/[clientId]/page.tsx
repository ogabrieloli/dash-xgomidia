'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, FolderOpen, Pencil, X, ChevronDown, ChevronRight, LayoutDashboard, ArrowLeft } from 'lucide-react'
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
  objective: z.enum(['LEAD', 'SALES', 'BRANDING']).optional(),
})
type CreateStrategyForm = z.infer<typeof CreateStrategySchema>

const OBJECTIVE_LABELS: Record<string, string> = {
  LEAD: 'Geração de Leads',
  SALES: 'Vendas (E-commerce)',
  BRANDING: 'Branding / Alcance',
}

const FUNNEL_LABELS: Record<string, string> = {
  WEBINAR: 'Webinário',
  DIRECT_SALE: 'Venda Direta',
  LEAD_GENERATION: 'Geração de Leads',
  ECOMMERCE: 'E-commerce',
  CUSTOM: 'Personalizado',
}

const FUNNEL_COLORS: Record<string, string> = {
  WEBINAR: 'bg-purple-50 text-purple-700 border border-purple-200',
  DIRECT_SALE: 'bg-green-50 text-green-700 border border-green-200',
  LEAD_GENERATION: 'bg-blue-50 text-blue-700 border border-blue-200',
  ECOMMERCE: 'bg-orange-50 text-orange-700 border border-orange-200',
  CUSTOM: 'bg-stone-50 text-stone-600 border border-stone-200',
}

function ClientAvatar({ name, logoUrl, size = 'md' }: { name: string; logoUrl: string | null; size?: 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-16 w-16 text-2xl' : 'h-10 w-10 text-base'
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`${sizeClass} rounded-xl object-cover border border-[#E8E2D8] flex-shrink-0`}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: '#3B82F6' }}
    >
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
      <div className="p-8 max-w-6xl">
        <div className="h-6 w-24 rounded-lg bg-stone-100 animate-pulse mb-6" />
        <div className="h-28 rounded-xl bg-stone-100 animate-pulse mb-6" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-stone-100 animate-pulse" />
            ))}
          </div>
          <div className="space-y-3">
            <div className="h-40 rounded-xl bg-stone-100 animate-pulse" />
            <div className="h-32 rounded-xl bg-stone-100 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (!client) return null

  const totalStrategies = client.projects.reduce((sum, p) => sum + (p.strategies?.length ?? 0), 0)

  return (
    <div className="p-8 max-w-6xl space-y-6">

      {/* Breadcrumb */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Clientes
      </Link>

      {/* Client header card */}
      <div className="bg-white rounded-xl border border-[#E8E2D8] shadow-sm p-6">
        <div className="flex items-start gap-5">
          {/* Avatar with edit overlay */}
          <div className="relative group flex-shrink-0">
            <ClientAvatar name={client.name} logoUrl={client.logoUrl} size="lg" />
            <button
              onClick={() => { setLogoInput(client.logoUrl ?? ''); setEditLogoOpen(true) }}
              className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title="Editar logo"
            >
              <Pencil className="h-4 w-4 text-white" />
            </button>
          </div>

          {/* Client info */}
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold text-stone-900 leading-tight">{client.name}</h1>
            <p className="text-sm text-stone-400 mt-0.5">/{client.slug}</p>
            {client.operation && (
              <p className="text-sm text-stone-500 mt-2 line-clamp-2">{client.operation}</p>
            )}
            <div className="flex items-center gap-2 mt-3 text-xs text-stone-400">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: '#EFF6FF', color: '#3B82F6' }}
              >
                {client.adAccounts.length} plataforma{client.adAccounts.length !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-stone-100 text-stone-600">
                {totalStrategies} estratégia{totalStrategies !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => setShowProjectForm(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors flex-shrink-0"
            style={{ backgroundColor: '#3B82F6' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#2563EB' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#3B82F6' }}
          >
            <Plus className="h-4 w-4" />
            Novo projeto
          </button>
        </div>
      </div>

      {/* Edit logo modal */}
      {editLogoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-[#E8E2D8] rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-stone-900">Editar logo</h3>
              <button onClick={() => setEditLogoOpen(false)} className="text-stone-400 hover:text-stone-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              {logoInput ? (
                <img src={logoInput} alt="Preview" className="h-12 w-12 rounded-xl object-cover border border-[#E8E2D8]" onError={() => setLogoInput('')} />
              ) : (
                <div className="h-12 w-12 rounded-xl border border-dashed border-[#E8E2D8] flex items-center justify-center text-xs text-stone-400">Logo</div>
              )}
              <input
                type="url"
                value={logoInput}
                onChange={(e) => setLogoInput(e.target.value)}
                className="flex-1 rounded-xl border border-[#E8E2D8] bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]"
                placeholder="https://exemplo.com/logo.png"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => updateLogoMutation.mutate(logoInput)}
                disabled={updateLogoMutation.isPending}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#3B82F6' }}
              >
                {updateLogoMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditLogoOpen(false)}
                className="rounded-lg border border-[#E8E2D8] px-4 py-2 text-sm hover:bg-stone-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Main column — Projetos & Estratégias (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-stone-800">Projetos & Estratégias</h2>
          </div>

          {/* New project form */}
          {showProjectForm && (
            <div className="bg-white rounded-xl border border-[#E8E2D8] p-4">
              <h3 className="text-sm font-semibold text-stone-800 mb-3">Novo projeto</h3>
              <form
                onSubmit={projectForm.handleSubmit((data) => projectMutation.mutate(data))}
                className="flex items-end gap-3"
              >
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Nome do projeto"
                    className="w-full rounded-lg border border-[#E8E2D8] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]"
                    {...projectForm.register('name')}
                  />
                  {projectForm.formState.errors.name && (
                    <p className="text-xs text-red-600 mt-1">{projectForm.formState.errors.name.message}</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={projectMutation.isPending}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#3B82F6' }}
                >
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setShowProjectForm(false)}
                  className="rounded-lg border border-[#E8E2D8] px-4 py-2 text-sm hover:bg-stone-50"
                >
                  Cancelar
                </button>
              </form>
            </div>
          )}

          {client.projects.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-[#E8E2D8] flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-xl bg-stone-100 flex items-center justify-center mb-3">
                <FolderOpen className="h-6 w-6 text-stone-300" />
              </div>
              <p className="text-sm font-medium text-stone-500">Nenhum projeto cadastrado</p>
              <button
                onClick={() => setShowProjectForm(true)}
                className="mt-3 text-sm font-medium transition-colors"
                style={{ color: '#3B82F6' }}
              >
                Criar primeiro projeto →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {client.projects.map((project) => (
                <div key={project.id} className="bg-white rounded-xl border border-[#E8E2D8] shadow-sm overflow-hidden">
                  {/* Project header */}
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors"
                    onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
                  >
                    <div className="text-left">
                      <p className="font-semibold text-stone-800 text-sm">{project.name}</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {project.strategies?.length ?? 0} estratégia{(project.strategies?.length ?? 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {expandedProject === project.id
                      ? <ChevronDown className="h-4 w-4 text-stone-400" />
                      : <ChevronRight className="h-4 w-4 text-stone-400" />
                    }
                  </button>

                  {/* Strategies */}
                  {expandedProject === project.id && (
                    <div className="border-t border-[#F5F0E8] bg-[#FDFAF6] px-5 py-4">
                      {(project.strategies?.length ?? 0) > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                          {project.strategies?.map((strategy) => (
                            <Link
                              key={strategy.id}
                              href={`/clients/${clientId}/strategies/${strategy.id}`}
                              className="group bg-white rounded-xl border border-[#E8E2D8] p-4 hover:shadow-sm hover:border-[#3B82F6]/30 transition-all flex flex-col gap-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-stone-800 text-sm leading-tight">{strategy.name}</p>
                                <span className={cn(
                                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0',
                                  FUNNEL_COLORS[strategy.funnelType] ?? 'bg-stone-50 text-stone-600',
                                )}>
                                  {FUNNEL_LABELS[strategy.funnelType] ?? strategy.funnelType}
                                </span>
                              </div>
                              {strategy.objective && (
                                <p className="text-xs text-stone-400">{OBJECTIVE_LABELS[strategy.objective] ?? strategy.objective}</p>
                              )}
                              <div
                                className="flex items-center gap-1 text-xs mt-auto group-hover:gap-2 transition-all"
                                style={{ color: '#3B82F6' }}
                              >
                                <LayoutDashboard className="h-3.5 w-3.5" />
                                <span>Ver dashboard</span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}

                      {/* New strategy form */}
                      {showStrategyForm === project.id ? (
                        <form
                          onSubmit={strategyForm.handleSubmit((data) =>
                            strategyMutation.mutate({ ...data, projectId: project.id }),
                          )}
                          className="space-y-3 bg-white rounded-xl border border-[#E8E2D8] p-3"
                        >
                          <p className="text-xs font-semibold text-stone-700">Nova estratégia</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Nome da estratégia *"
                              className="flex-1 rounded-lg border border-[#E8E2D8] bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]"
                              {...strategyForm.register('name')}
                            />
                            <select
                              className="rounded-lg border border-[#E8E2D8] bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30"
                              {...strategyForm.register('funnelType')}
                            >
                              {Object.entries(FUNNEL_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                          <select
                            className="w-full rounded-lg border border-[#E8E2D8] bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30"
                            {...strategyForm.register('objective')}
                          >
                            <option value="">Objetivo (opcional)</option>
                            {Object.entries(OBJECTIVE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={strategyMutation.isPending}
                              className="rounded-lg px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              style={{ backgroundColor: '#3B82F6' }}
                            >
                              {strategyMutation.isPending ? 'Criando...' : 'Criar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setShowStrategyForm(null); strategyForm.reset() }}
                              className="text-xs text-stone-400 hover:text-stone-700"
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          onClick={() => setShowStrategyForm(project.id)}
                          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 transition-colors"
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

        {/* Right sidebar (1/3) */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <PlatformsSection clientId={clientId} pendingId={metaPendingId} />
          <InsightsPanel clientId={clientId} />
          <TimelineFeed clientId={clientId} />
        </div>
      </div>
    </div>
  )
}
