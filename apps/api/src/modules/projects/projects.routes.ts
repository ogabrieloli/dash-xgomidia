import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { ProjectsService } from './projects.service.js'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { assertClientAccess } from '../../shared/guards/client-access.guard.js'
import { AppError, NotFoundError } from '../../shared/errors/index.js'

const CreateProjectSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  description: z.string().max(500).optional(),
  clientId: z.string().uuid(),
}).strict()

const UpdateProjectSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  description: z.string().max(500).nullable().optional(),
}).strict()

const ProjectParamsSchema = z.object({ id: z.string().uuid() })

export async function projectsRoutes(app: FastifyInstance) {
  const service = new ProjectsService(app.db)

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: error.errors[0]?.message ?? 'Dados inválidos' },
      })
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      })
    }
    app.log.error(error)
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } })
  })

  // GET /api/projects?clientId=xxx
  app.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = z.object({ clientId: z.string().uuid() }).parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const projects = await service.list(query.clientId)
    return { data: projects }
  })

  // GET /api/projects/:id?clientId=xxx
  app.get('/:id', {
    preHandler: [authenticate],
  }, async (request) => {
    const { id } = ProjectParamsSchema.parse(request.params)
    const query = z.object({ clientId: z.string().uuid() }).parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const project = await service.findById(id, query.clientId)
    if (!project) throw new NotFoundError('Projeto não encontrado')
    return { data: project }
  })

  // POST /api/projects
  app.post('/', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const body = CreateProjectSchema.parse(request.body)
    await assertClientAccess(request.user.sub, request.user.role, body.clientId, app.db)

    const project = await service.create(
      { name: body.name, description: body.description },
      body.clientId,
      request.user.sub,
    )
    return reply.status(201).send({ data: project })
  })

  // PATCH /api/projects/:id
  app.patch('/:id', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request) => {
    const { id } = ProjectParamsSchema.parse(request.params)
    const body = z.object({
      ...UpdateProjectSchema.shape,
      clientId: z.string().uuid(),
    }).parse(request.body)

    await assertClientAccess(request.user.sub, request.user.role, body.clientId, app.db)

    const project = await service.update(
      id,
      { name: body.name, description: body.description ?? undefined },
      body.clientId,
      request.user.sub,
    )
    return { data: project }
  })

  // DELETE /api/projects/:id
  app.delete('/:id', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const { id } = ProjectParamsSchema.parse(request.params)
    const query = z.object({ clientId: z.string().uuid() }).parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    await service.softDelete(id, query.clientId, request.user.sub)
    return reply.status(204).send()
  })
}
