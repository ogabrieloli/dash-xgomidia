# XGO Midia Platform

Central de análise de tráfego pago multi-plataforma para a agência XGO Midia.

## Setup Inicial

### 1. Pré-requisitos

- Node.js 20+
- pnpm 10+
- Docker e Docker Compose

### 2. Instalar dependências

```bash
pnpm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Editar .env com seus valores
```

### 4. Subir serviços locais

```bash
docker compose up -d
# Aguardar: PostgreSQL, Redis, Vault e Mailpit subirem
```

### 5. Aplicar migrations e gerar Prisma client

```bash
pnpm --filter "@xgo/api" db:generate
pnpm --filter "@xgo/api" db:migrate
```

### 6. Seed do banco (dados de exemplo)

```bash
pnpm --filter "@xgo/api" db:seed
# Cria: agência XGO, admin@xgomidia.com.br (senha: admin123!), cliente demo
```

### 7. Rodar em desenvolvimento

```bash
pnpm dev
# API: http://localhost:3001
# Web: http://localhost:3000
# Vault UI: http://localhost:8200 (token: root)
# Mailpit: http://localhost:8025
```

## Estrutura

```
xgo-platform/
├── apps/
│   ├── api/          # Fastify 4 + Prisma 5 + PostgreSQL 16
│   ├── workers/      # BullMQ workers independentes
│   └── web/          # Next.js 14 App Router
├── packages/
│   ├── shared-types/ # Tipos TypeScript compartilhados
│   ├── metrics-schema/ # Interface PlatformAdapter + NormalizedMetric
│   └── ui/           # Componentes shadcn/ui base
└── infrastructure/
    └── docker/       # Docker Compose
```

## Comandos

```bash
pnpm dev              # Rodar tudo em desenvolvimento
pnpm build            # Build de produção
pnpm type-check       # Verificar tipos TypeScript
pnpm lint             # Lint
pnpm test             # Testes
```

## Documentação

Ver [CLAUDE (2).md](./CLAUDE%20(2).md) para a arquitetura completa, modelo de dados, regras de segurança e roadmap.


