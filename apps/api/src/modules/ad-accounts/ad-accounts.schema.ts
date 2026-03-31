import { z } from 'zod'

export const CreateAdAccountSchema = z.object({
  clientId: z.string().uuid(),
  platform: z.enum(['META_ADS', 'GOOGLE_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS']),
  externalId: z.string().min(1).max(100),
  name: z.string().min(1).max(150),
  vaultSecretPath: z.string().min(1),
  currency: z.string().max(3).optional(),
  timezone: z.string().optional(),
})

export const AdAccountIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const AdAccountClientQuerySchema = z.object({
  clientId: z.string().uuid(),
})
