import { z } from 'zod'

export const CreateClientSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens').min(2).max(50),
  logoUrl: z.string().url().optional(),
  operation: z.string().max(500).optional(),
  alreadyInvesting: z.boolean().optional(),
  initialInvestment: z.number().positive().optional(),
  reportedRevenue: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
}).strict()

export const UpdateClientSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  logoUrl: z.string().url().nullable().optional(),
  operation: z.string().max(500).nullable().optional(),
  alreadyInvesting: z.boolean().optional(),
  initialInvestment: z.number().positive().nullable().optional(),
  reportedRevenue: z.number().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict()

export const ListClientsQuerySchema = z.object({
  search: z.string().optional(),
})

export const ClientIdParamSchema = z.object({
  id: z.string().uuid(),
})

export type CreateClientInput = z.infer<typeof CreateClientSchema>
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>
