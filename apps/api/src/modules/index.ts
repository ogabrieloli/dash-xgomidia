import type { FastifyInstance } from 'fastify'

/**
 * Registro de todas as rotas da API.
 * Cada módulo registra suas próprias rotas com prefixo.
 */
export async function registerRoutes(app: FastifyInstance) {
  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  const { authRoutes } = await import('./auth/auth.routes.js')
  await app.register(authRoutes, { prefix: '/auth' })

  const { metaOAuthRoutes } = await import('./auth/meta-oauth.routes.js')
  await app.register(metaOAuthRoutes, { prefix: '/auth/meta' })

  const { clientsRoutes } = await import('./clients/clients.routes.js')
  await app.register(clientsRoutes, { prefix: '/api/clients' })

  const { projectsRoutes } = await import('./projects/projects.routes.js')
  await app.register(projectsRoutes, { prefix: '/api/projects' })

  const { strategiesRoutes } = await import('./strategies/strategies.routes.js')
  await app.register(strategiesRoutes, { prefix: '/api/strategies' })

  const { adAccountsRoutes } = await import('./ad-accounts/ad-accounts.routes.js')
  await app.register(adAccountsRoutes, { prefix: '/api/ad-accounts' })

  const { metricsRoutes } = await import('./metrics/metrics.routes.js')
  await app.register(metricsRoutes, { prefix: '/api/metrics' })

  const { aiInsightsRoutes } = await import('./ai/ai-insights.routes.js')
  await app.register(aiInsightsRoutes, { prefix: '/api/insights' })

  const { aiChatRoutes } = await import('./ai/ai-chat.routes.js')
  await app.register(aiChatRoutes, { prefix: '/api/ai' })

  const { timelineRoutes } = await import('./timeline/timeline.routes.js')
  await app.register(timelineRoutes, { prefix: '/api/timeline' })

  const { reportsRoutes } = await import('./reports/reports.routes.js')
  await app.register(reportsRoutes, { prefix: '/api/reports' })

  // Rota pública para links compartilhados — sem autenticação
  const { shareRoutes } = await import('./reports/share.routes.js')
  await app.register(shareRoutes, { prefix: '/r' })
}
