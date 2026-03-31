FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Instalando dependências globais e de SO úteis no Alpine
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Fase de build 
FROM base AS builder
# Copia tudo pro contexto do docker
COPY . .

# Usa cache para acelerar pnpm install
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Gera os tipos do Prisma Client usando o CLI local do projeto (v5)
RUN pnpm --filter "@xgo/api" db:generate

# Faz o build de tudo
RUN pnpm build

# Fase final (Runner)
FROM base AS runner
ENV NODE_ENV=production

# Copia os arquivos todos já instalados e buildados lá do builder
COPY --from=builder /app /app/

EXPOSE 3000

# O Start será sobrescrito pelo Easypanel (lembre de usar o pnpm --filter)
CMD ["pnpm", "start"]
