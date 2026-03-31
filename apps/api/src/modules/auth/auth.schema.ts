import { z } from 'zod'

export const LoginBodySchema = z.object({
  email: z.string().email('E-mail inválido').toLowerCase().trim(),
  password: z.string().min(1, 'Senha obrigatória'),
}).strict()

export type LoginBody = z.infer<typeof LoginBodySchema>
