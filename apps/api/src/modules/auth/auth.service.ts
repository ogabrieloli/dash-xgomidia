import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { PrismaClient } from '@prisma/client'
import type { JwtPayload } from '@xgo/shared-types'
import { UnauthorizedError } from '../../shared/errors/index.js'
import { audit } from '../../shared/utils/audit.js'

interface LoginResult {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    role: string
    agencyId: string
  }
}

interface RefreshResult {
  accessToken: string
  refreshToken: string
}

export class AuthService {
  constructor(private readonly db: PrismaClient) { }

  async login(email: string, password: string): Promise<LoginResult> {
    // Buscar usuário ativo — nunca retornar mensagem diferente para email vs senha
    // (previne user enumeration)
    const user = await this.db.user.findFirst({
      where: { email, deletedAt: null },
    })

    if (!user) {
      throw new UnauthorizedError('Credenciais inválidas')
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash)
    if (!passwordValid) {
      throw new UnauthorizedError('Credenciais inválidas')
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(user.id, user.role as JwtPayload['role'], user.agencyId)

    // Audit — sem dados sensíveis
    await audit(this.db, 'auth.login', { type: 'User', id: user.id }, {
      userId: user.id,
      after: { email: user.email, role: user.role },
    })

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        agencyId: user.agencyId,
      },
    }
  }

  async refresh(rawRefreshToken: string): Promise<RefreshResult> {
    const tokenHash = this.hashToken(rawRefreshToken)

    const stored = await this.db.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, role: true, agencyId: true, deletedAt: true } } },
    })

    if (!stored || stored.revokedAt !== null || stored.user.deletedAt !== null) {
      throw new UnauthorizedError('Refresh token expirado ou inválido')
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expirado ou inválido')
    }

    // Revogar o token atual (rotação obrigatória)
    await this.db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    const { accessToken, refreshToken } = await this.issueTokenPair(
      stored.user.id,
      stored.user.role as JwtPayload['role'],
      stored.user.agencyId,
    )

    return { accessToken, refreshToken }
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken)

    // Silencioso — não lança erro se o token não existir
    await this.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  // ─────────────────────────────────────────────
  // Privados
  // ─────────────────────────────────────────────

  private async issueTokenPair(
    userId: string,
    role: JwtPayload['role'],
    agencyId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtSecret = process.env['JWT_SECRET']
    if (!jwtSecret) throw new Error('JWT_SECRET não configurado')

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub: userId, role, agencyId }
    const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: '15m' })

    // Refresh token: 32 bytes criptograficamente aleatórios
    const rawRefreshToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = this.hashToken(rawRefreshToken)

    const refreshTtlDays = 7
    const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000)

    await this.db.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    })

    return { accessToken, refreshToken: rawRefreshToken }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }
}
