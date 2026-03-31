FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Primeiro, instalamos as dependências do root
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Copiar os package.json de cada app e package para não quebrar a árvore
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/workers/ai-insights/package.json ./apps/workers/ai-insights/
COPY apps/workers/meta-ads-sync/package.json ./apps/workers/meta-ads-sync/
COPY apps/workers/notifications/package.json ./apps/workers/notifications/
COPY apps/workers/report-renderer/package.json ./apps/workers/report-renderer/
COPY apps/workers/scheduler/package.json ./apps/workers/scheduler/
COPY packages/metrics-schema/package.json ./packages/metrics-schema/
COPY packages/shared-types/package.json ./packages/shared-types/

# Instalar tudo (ignora os scripts pra não rodar nada desnecessário no build)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

# Build da aplicação
FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
# Copia dependências instaladas localmente nos workspaces também
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules || true
COPY --from=deps /app/packages/metrics-schema/node_modules ./packages/metrics-schema/node_modules || true
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules || true
# (os workers pegam as dps locais pelo pnpm automático)

RUN pnpm install && pnpm build

FROM base AS runner
# Ambiente puro de produção
ENV NODE_ENV=production

COPY --from=builder /app /app/

# Expõe porta TCP padrão (o easypanel lida com a injeção do PORT)
EXPOSE 3000

# O comando final é injetado pelo painel do Easypanel dependendo do contêiner.
CMD ["pnpm", "start"]
