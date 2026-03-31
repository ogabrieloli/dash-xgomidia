# XGO Midia — Plataforma de Análise de Tráfego Pago
## Guia de Arquitetura e Desenvolvimento

> **Este documento é a fonte de verdade para o desenvolvimento da plataforma.**
> Leia integralmente antes de escrever qualquer linha de código.

---

## Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estrutura de Pastas](#3-estrutura-de-pastas)
4. [Modelo de Dados](#4-modelo-de-dados)
5. [Arquitetura de Serviços](#5-arquitetura-de-serviços)
6. [Segurança — Regras Críticas](#6-segurança--regras-críticas)
7. [Integrações com Plataformas de Anúncios](#7-integrações-com-plataformas-de-anúncios)
8. [Módulo de IA Híbrida](#8-módulo-de-ia-híbrida)
9. [Sistema de Relatórios](#9-sistema-de-relatórios)
10. [Autenticação e Controle de Acesso](#10-autenticação-e-controle-de-acesso)
11. [Variáveis de Ambiente](#11-variáveis-de-ambiente)
12. [Fluxos Principais — Passo a Passo](#12-fluxos-principais--passo-a-passo)
13. [Padrões de Código](#13-padrões-de-código)
14. [Roadmap de Fases](#14-roadmap-de-fases)

---

## 1. Visão Geral do Sistema

A XGO Midia Platform é uma central de análise de tráfego pago multi-plataforma. Ela consolida dados de múltiplas contas de anúncios de múltiplos clientes em um único lugar, com análises por IA e geração automatizada de relatórios.

### Hierarquia de Entidades

```
Agência (XGO Midia)
└── Cliente (ex: Empresa ABC)
    ├── Contas de Anúncio (Meta Ads, Google Ads, TikTok...)
    └── Projeto (ex: Infoprodutos 2025)
        └── Estratégia (ex: Webinário / Venda Direta)
            ├── Dashboard customizável
            ├── Métricas e KPIs
            └── Relatórios e Insights de IA
```

### Papéis de Usuário

| Papel | Acesso |
|---|---|
| `AGENCY_ADMIN` | Acesso total — todos os clientes, configurações globais |
| `AGENCY_MANAGER` | Acesso aos clientes atribuídos, sem configurações de billing |
| `CLIENT_VIEWER` | Somente leitura — dados do próprio cliente, sem dados de outros clientes |

---

## 2. Stack Tecnológico

### Back-end
- **Runtime:** Node.js 20 LTS + TypeScript 5
- **Framework API:** Fastify 4 (mais performático que Express para workloads de I/O)
- **ORM:** Prisma 5 (type-safe, migrations controladas)
- **Banco de dados:** PostgreSQL 16
- **Cache / Filas:** Redis 7 + BullMQ 4
- **Autenticação:** JWT (access token 15min) + Refresh Token (httpOnly cookie, 7 dias)
- **Geração de PDF:** Puppeteer (headless Chrome) via worker isolado
- **Geração de PPT:** pptxgenjs
- **E-mail:** Resend (ou SendGrid como fallback)
- **Object Storage:** Cloudflare R2 (compatível com S3 SDK)

### Front-end

- **Framework:** Next.js 14 (App Router)
- **CSS:** Tailwind CSS — base para todas as bibliotecas abaixo
- **State:** Zustand (client state) + React Query (server state)

#### Bibliotecas de UI — decisões e justificativas

**shadcn/ui** → base de todos os componentes (buttons, modals, inputs, nav, dropdowns, toasts)
- Não é uma dependência instalada — os componentes são copiados para `components/ui/` e pertencem ao projeto
- Construído sobre Radix UI primitives: acessibilidade (ARIA, foco, teclado) resolvida sem esforço
- Permite customização total para a identidade visual da XGO sem lutar contra estilos de terceiros
- Dark mode e temas via CSS variables nativamente
- Evitar: Ant Design (bundle ~500kb, visual difícil de desfazer), Mantine (opinativo demais para branding próprio)

**TanStack Table v8** → todas as tabelas de dados e métricas
- Headless (zero estilo próprio) — a lógica fica no TanStack, o visual fica no shadcn/ui
- Essencial para os requisitos do projeto: sorting multi-coluna, filtering, paginação, virtualização de linhas, row selection para exportação
- TypeScript-first, integra direto com React Query para dados server-side

**Recharts** → gráficos (linha, área, barra, pizza, compostos)
- API React declarativa built sobre D3 — sem aprender D3 diretamente
- Responsivo e fácil de integrar com dados dinâmicos das métricas
- Tooltip e legenda 100% customizáveis via render props
- Alternativa para casos complexos: Visx (D3 direto) ou ECharts (mais performático em séries densas)

**React Hook Form + Zod** → todos os formulários
- Schema Zod compartilhado entre front-end e back-end — validação idêntica nos dois lados sem duplicação
- React Hook Form evita re-renders desnecessários (controle uncontrolled por padrão)
- Integração nativa com shadcn/ui via componente `<FormField>`

**date-fns + react-day-picker** → manipulação de datas e filtros de período
- O shadcn/ui já inclui o componente `Calendar` e `DateRangePicker` built sobre react-day-picker — sem instalação extra
- date-fns para formatação, comparação e cálculo de períodos nos dashboards

**Lucide React** → ícones
- Biblioteca padrão do shadcn/ui — já instalada, consistente, 1000+ ícones SVG tree-shakeable

**Tremor** → (opcional, avaliar por feature) componentes analíticos prontos
- Útil especificamente para: cards KPI com delta, ProgressBar, Tracker, Sparkline
- Estratégia: usar shadcn/ui para layout geral + Tremor para widgets analíticos onde a velocidade de entrega justificar
- Não usar como substituto do shadcn/ui — usar como complemento pontual

#### Resumo rápido para novos devs

```
shadcn/ui          → tudo que é UI geral (layout, forms, nav, modais)
TanStack Table     → qualquer tabela com dados reais
Recharts           → qualquer gráfico
React Hook Form    → qualquer formulário
Zod                → validação (mesmo schema do back-end)
date-fns           → manipulação de datas
Lucide React       → ícones
Tremor             → (pontual) cards KPI e componentes analíticos prontos
```

### Infraestrutura
- **Containerização:** Docker + Docker Compose (dev) / Kubernetes (prod)
- **CI/CD:** GitHub Actions
- **Secrets:** HashiCorp Vault (prod) / `.env` local (nunca commitar)
- **Logs:** Pino (estruturado em JSON) + Grafana Loki
- **Monitoramento:** Sentry (erros) + Prometheus + Grafana (métricas)

---

## 3. Estrutura de Pastas

```
xgo-platform/
├── apps/
│   ├── api/                        # Serviço de API principal (Fastify)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # Login, tokens, refresh
│   │   │   │   ├── agencies/       # Gestão da agência
│   │   │   │   ├── clients/        # CRUD de clientes
│   │   │   │   ├── projects/       # Projetos e estratégias
│   │   │   │   ├── metrics/        # Agregação e consulta de métricas
│   │   │   │   ├── reports/        # Geração e entrega de relatórios
│   │   │   │   ├── timeline/       # Linha do tempo de ações
│   │   │   │   └── ai/             # Orquestrador de IA
│   │   │   ├── shared/
│   │   │   │   ├── middleware/     # Auth, rate-limit, auditoria
│   │   │   │   ├── guards/         # Verificação de permissões RBAC
│   │   │   │   ├── errors/         # Classes de erro padronizadas
│   │   │   │   └── utils/
│   │   │   ├── plugins/            # Plugins Fastify (db, redis, vault)
│   │   │   └── app.ts
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── migrations/
│   │
│   ├── workers/                    # Serviços assíncronos independentes
│   │   ├── meta-ads-sync/          # Sincronização Meta Ads
│   │   ├── google-ads-sync/        # Sincronização Google Ads
│   │   ├── ai-insights/            # Geração de insights por IA
│   │   ├── report-renderer/        # Renderização de PDF/PPT
│   │   └── notifications/          # E-mails e alertas
│   │
│   └── web/                        # Front-end Next.js
│       ├── app/
│       │   ├── (agency)/           # Rotas da agência (admins/managers)
│       │   ├── (client)/           # Portal do cliente (somente leitura)
│       │   └── (public)/           # Links compartilháveis (sem auth)
│       └── components/
│
├── packages/
│   ├── shared-types/               # Tipos TypeScript compartilhados
│   ├── metrics-schema/             # Schema normalizado de métricas
│   └── ui/                         # Componentes de UI compartilhados
│
├── infrastructure/
│   ├── docker/
│   ├── k8s/
│   └── terraform/
│
└── docs/
    ├── CLAUDE.md                   # Este arquivo
    ├── api-reference.md
    └── adr/                        # Architecture Decision Records
```

---

## 4. Modelo de Dados

### Schema Principal (Prisma)

```prisma
// ─────────────────────────────────────────────
// IDENTIDADE E ACESSO
// ─────────────────────────────────────────────

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String    // bcrypt, custo 12 — NUNCA expor via API
  role          UserRole
  agencyId      String
  agency        Agency    @relation(fields: [agencyId], references: [id])
  clientAccess  ClientUserAccess[]
  auditLogs     AuditLog[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime? // soft delete obrigatório
}

enum UserRole {
  AGENCY_ADMIN
  AGENCY_MANAGER
  CLIENT_VIEWER
}

model RefreshToken {
  id          String    @id @default(uuid())
  userId      String
  tokenHash   String    @unique // SHA-256 do token — NUNCA armazenar o token em claro
  expiresAt   DateTime
  revokedAt   DateTime?
  userAgent   String?
  ipAddress   String?
  user        User      @relation(fields: [userId], references: [id])
  createdAt   DateTime  @default(now())
}

// ─────────────────────────────────────────────
// ESTRUTURA DE NEGÓCIO
// ─────────────────────────────────────────────

model Agency {
  id        String    @id @default(uuid())
  name      String
  users     User[]
  clients   Client[]
  createdAt DateTime  @default(now())
}

model Client {
  id               String    @id @default(uuid())
  agencyId         String
  agency           Agency    @relation(fields: [agencyId], references: [id])
  name             String
  slug             String    @unique // para URLs amigáveis
  adAccounts       AdAccount[]
  projects         Project[]
  timelineEntries  TimelineEntry[]
  userAccess       ClientUserAccess[]
  aiInsights       AiInsight[]
  reports          Report[]
  deletedAt        DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model ClientUserAccess {
  id        String   @id @default(uuid())
  clientId  String
  userId    String
  client    Client   @relation(fields: [clientId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  @@unique([clientId, userId])
}

model Project {
  id          String      @id @default(uuid())
  clientId    String
  client      Client      @relation(fields: [clientId], references: [id])
  name        String
  description String?
  strategies  Strategy[]
  deletedAt   DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Strategy {
  id            String         @id @default(uuid())
  projectId     String
  project       Project        @relation(fields: [projectId], references: [id])
  name          String
  funnelType    FunnelType
  metricConfig  Json           // configuração das métricas visíveis no dashboard
  metrics       MetricSnapshot[]
  aiInsights    AiInsight[]
  reports       Report[]
  deletedAt     DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

enum FunnelType {
  WEBINAR
  DIRECT_SALE
  LEAD_GENERATION
  ECOMMERCE
  CUSTOM
}

// ─────────────────────────────────────────────
// CONTAS DE ANÚNCIO E MÉTRICAS
// ─────────────────────────────────────────────

model AdAccount {
  id              String    @id @default(uuid())
  clientId        String
  client          Client    @relation(fields: [clientId], references: [id])
  platform        Platform
  externalId      String    // ID da conta na plataforma (ex: act_123456789)
  // CRÍTICO: tokens de acesso NUNCA ficam aqui — ficam no Vault
  // Referência para buscar no Vault:
  vaultSecretPath String    // ex: "secret/clients/{clientId}/meta-ads/{externalId}"
  name            String
  currency        String    @default("BRL")
  timezone        String    @default("America/Sao_Paulo")
  lastSyncAt      DateTime?
  syncStatus      SyncStatus @default(PENDING)
  metrics         MetricSnapshot[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

enum Platform {
  META_ADS
  GOOGLE_ADS
  TIKTOK_ADS
  LINKEDIN_ADS
}

enum SyncStatus {
  PENDING
  SYNCING
  SUCCESS
  ERROR
}

// Schema unificado de métricas — todas as plataformas
// se normalizam para este formato antes de persistir
model MetricSnapshot {
  id            String    @id @default(uuid())
  adAccountId   String
  strategyId    String?   // opcional — pode ser associado a uma estratégia
  adAccount     AdAccount @relation(fields: [adAccountId], references: [id])
  strategy      Strategy? @relation(fields: [strategyId], references: [id])
  date          DateTime  @db.Date
  platform      Platform

  // Métricas universais
  impressions   BigInt    @default(0)
  clicks        BigInt    @default(0)
  spend         Decimal   @db.Decimal(12, 2)
  conversions   Int       @default(0)
  revenue       Decimal?  @db.Decimal(12, 2)

  // Métricas derivadas (calculadas, não armazenadas — use views no DB)
  // ctr = clicks / impressions
  // cpc = spend / clicks
  // cpa = spend / conversions
  // roas = revenue / spend

  // Dados extras da plataforma (JSONB para flexibilidade)
  rawData       Json?     // dados brutos da plataforma — útil para debug
  createdAt     DateTime  @default(now())

  @@unique([adAccountId, date, platform])
  @@index([adAccountId, date])
  @@index([strategyId, date])
}

// ─────────────────────────────────────────────
// IA, RELATÓRIOS E LINHA DO TEMPO
// ─────────────────────────────────────────────

model AiInsight {
  id          String       @id @default(uuid())
  clientId    String?
  strategyId  String?
  client      Client?      @relation(fields: [clientId], references: [id])
  strategy    Strategy?    @relation(fields: [strategyId], references: [id])
  type        InsightType
  severity    Severity
  title       String
  body        String       @db.Text
  source      InsightSource // RULES_ENGINE ou LLM
  metadata    Json?        // contexto usado para gerar o insight
  readAt      DateTime?
  createdAt   DateTime     @default(now())
}

enum InsightType {
  ALERT        // anomalia detectada
  SUGGESTION   // oportunidade de melhoria
  SUMMARY      // resumo de performance
  COMPARISON   // comparativo de períodos
}

enum Severity {
  INFO
  WARNING
  CRITICAL
}

enum InsightSource {
  RULES_ENGINE
  LLM
}

model Report {
  id            String        @id @default(uuid())
  clientId      String
  strategyId    String?
  client        Client        @relation(fields: [clientId], references: [id])
  strategy      Strategy?     @relation(fields: [strategyId], references: [id])
  title         String
  type          ReportType
  status        ReportStatus  @default(PENDING)
  // Referência ao arquivo no Object Storage — NUNCA URL pública permanente
  storageKey    String?       // ex: "reports/{clientId}/{reportId}.pdf"
  shareToken    String?       @unique // token para link compartilhável (expiração controlada)
  shareExpiresAt DateTime?
  generatedAt   DateTime?
  createdAt     DateTime      @default(now())
  config        Json          // parâmetros usados para gerar o relatório
}

enum ReportType {
  PDF
  PPT
  WEB
}

enum ReportStatus {
  PENDING
  PROCESSING
  DONE
  ERROR
}

model TimelineEntry {
  id          String    @id @default(uuid())
  clientId    String
  client      Client    @relation(fields: [clientId], references: [id])
  authorId    String
  type        TimelineEntryType
  title       String
  body        String    @db.Text
  occurredAt  DateTime
  createdAt   DateTime  @default(now())
}

enum TimelineEntryType {
  ACTION       // ação executada no tráfego
  MEETING      // reunião com o cliente
  OPTIMIZATION // otimização de campanha
  NOTE         // nota livre
  ALERT        // alerta gerado pelo sistema
}

// ─────────────────────────────────────────────
// AUDITORIA — OBRIGATÓRIO PARA DADOS SENSÍVEIS
// ─────────────────────────────────────────────

model AuditLog {
  id          String    @id @default(uuid())
  userId      String?   // null se ação do sistema
  user        User?     @relation(fields: [userId], references: [id])
  action      String    // ex: "client.create", "adAccount.token.rotate"
  resourceType String
  resourceId  String
  before      Json?     // estado anterior (omitir campos sensíveis)
  after       Json?     // estado posterior (omitir campos sensíveis)
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime  @default(now())

  @@index([userId])
  @@index([resourceType, resourceId])
  @@index([createdAt])
}
```

---

## 5. Arquitetura de Serviços

### API Principal (Fastify)

Cada módulo segue a estrutura:

```
modules/clients/
├── clients.routes.ts     # Definição de rotas + schemas de validação (Zod)
├── clients.service.ts    # Lógica de negócio
├── clients.repository.ts # Queries ao banco (via Prisma)
├── clients.schema.ts     # Tipos e validações Zod
└── clients.test.ts       # Testes unitários e de integração
```

### Workers (BullMQ)

Cada worker é um processo Node.js independente, consumindo filas do Redis.

```typescript
// Exemplo de definição de fila — packages/shared-types/queues.ts
export const QUEUES = {
  META_ADS_SYNC:    'meta-ads-sync',
  GOOGLE_ADS_SYNC:  'google-ads-sync',
  AI_INSIGHTS:      'ai-insights',
  REPORT_RENDER:    'report-render',
  NOTIFICATIONS:    'notifications',
} as const

// Payload tipado por fila
export interface MetaAdsSyncJob {
  adAccountId: string
  clientId: string
  dateRange: { from: string; to: string }
  triggeredBy: 'scheduler' | 'manual'
}
```

**Regras dos workers:**
- Workers nunca fazem chamadas HTTP entre si — comunicam-se somente via filas
- Todo job deve ser idempotente (re-executável sem efeitos duplicados)
- Implementar retry com backoff exponencial: tentativas 1, 2, 5, 10 minutos
- Jobs com mais de 3 falhas vão para Dead Letter Queue e geram alerta

### Scheduler (Cron)

```typescript
// apps/workers/scheduler/jobs.ts
export const SYNC_SCHEDULES = {
  META_ADS:    '*/15 * * * *',   // a cada 15 minutos
  GOOGLE_ADS:  '*/30 * * * *',   // a cada 30 minutos
  AI_DAILY:    '0 7 * * *',      // diário às 7h (horário de Brasília)
  REPORT_WEEK: '0 8 * * 1',      // segunda-feira 8h (relatórios semanais)
} as const
```

---

## 6. Segurança — Regras Críticas

> **Esta seção é inegociável. Qualquer PR que viole estas regras será rejeitado.**

### 6.1 Tokens de Acesso às Plataformas de Anúncios

Os tokens OAuth das plataformas (Meta, Google, TikTok) são os ativos mais sensíveis do sistema.

```
REGRA: Tokens de acesso JAMAIS são armazenados no banco de dados principal.
```

**Fluxo correto:**

```
1. Usuário conecta conta de anúncio via OAuth
2. API recebe o token de acesso + refresh token
3. API envia o token para o Vault com TTL = 90 dias
4. API armazena no banco APENAS: vaultSecretPath (ex: "secret/clients/abc/meta/act_123")
5. Workers buscam o token no Vault em runtime, nunca em cache local
6. Ao usar, verificar se o token está próximo de expirar (< 7 dias) e renovar proativamente
```

**Implementação:**

```typescript
// apps/api/src/plugins/vault.ts
import Vault from 'node-vault'

export async function storeAdAccountToken(
  clientId: string,
  platform: Platform,
  externalId: string,
  tokens: { accessToken: string; refreshToken?: string; expiresAt: Date }
): Promise<string> {
  const path = `secret/clients/${clientId}/${platform.toLowerCase()}/${externalId}`

  await vault.write(path, {
    access_token: tokens.accessToken,      // sensível
    refresh_token: tokens.refreshToken,    // sensível
    expires_at: tokens.expiresAt.toISOString(),
  })

  // Retornar apenas o path — que vai para o banco
  return path
}

export async function getAdAccountToken(vaultSecretPath: string) {
  const { data } = await vault.read(vaultSecretPath)
  return data as { access_token: string; refresh_token: string; expires_at: string }
}
```

### 6.2 Autenticação e Tokens JWT

```typescript
// CORRETO — Access token de curta duração
const ACCESS_TOKEN_TTL  = '15m'
const REFRESH_TOKEN_TTL = '7d'

// Access token: payload mínimo — não incluir dados sensíveis
interface JwtPayload {
  sub: string       // userId
  role: UserRole
  agencyId: string
  iat: number
  exp: number
}

// Refresh token: armazenado como HASH (SHA-256) no banco
// O token em si vai no cookie httpOnly — nunca no localStorage
```

**Configuração do cookie de refresh:**

```typescript
reply.setCookie('refresh_token', token, {
  httpOnly: true,      // inacessível via JavaScript
  secure: true,        // HTTPS somente
  sameSite: 'strict',  // proteção CSRF
  path: '/auth',       // escopo mínimo necessário
  maxAge: 7 * 24 * 3600,
})
```

### 6.3 Isolamento de Dados entre Clientes

```
REGRA: Toda query ao banco que retorna dados de cliente DEVE incluir o clientId
como filtro, após verificar que o usuário tem acesso a aquele clientId.
```

**Guard de acesso obrigatório:**

```typescript
// apps/api/src/shared/guards/client-access.guard.ts
export async function assertClientAccess(
  userId: string,
  userRole: UserRole,
  clientId: string,
  db: PrismaClient
): Promise<void> {
  // AGENCY_ADMIN tem acesso a tudo dentro da agência do usuário
  if (userRole === 'AGENCY_ADMIN') return

  // AGENCY_MANAGER: verificar se cliente pertence à agência do manager
  if (userRole === 'AGENCY_MANAGER') {
    const client = await db.client.findFirst({
      where: { id: clientId, agency: { users: { some: { id: userId } } } }
    })
    if (!client) throw new ForbiddenError('Acesso negado a este cliente')
    return
  }

  // CLIENT_VIEWER: verificar acesso explícito
  const access = await db.clientUserAccess.findUnique({
    where: { clientId_userId: { clientId, userId } }
  })
  if (!access) throw new ForbiddenError('Acesso negado a este cliente')
}
```

**Nunca fazer isso:**

```typescript
// ❌ ERRADO — busca sem filtro de isolamento
const metrics = await db.metricSnapshot.findMany({
  where: { date: { gte: startDate } }
})

// ✅ CORRETO — sempre filtrar por conta de anúncio do cliente
const metrics = await db.metricSnapshot.findMany({
  where: {
    adAccount: { clientId: verifiedClientId }, // clientId verificado pelo guard
    date: { gte: startDate }
  }
})
```

### 6.4 Links Compartilháveis de Relatórios

```typescript
// Geração de link seguro com token de acesso único e expiração
export async function generateShareableLink(reportId: string, expiresInHours = 72) {
  // Token criptograficamente aleatório — 32 bytes = 256 bits de entropia
  const shareToken = crypto.randomBytes(32).toString('hex')
  const shareExpiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000)

  await db.report.update({
    where: { id: reportId },
    data: { shareToken, shareExpiresAt }
  })

  // URL pública aponta para rota que valida o token
  return `${env.PUBLIC_URL}/r/${shareToken}`
}

// Middleware de validação do link
export async function validateShareToken(token: string) {
  const report = await db.report.findUnique({
    where: { shareToken: token }
  })

  if (!report) throw new NotFoundError('Relatório não encontrado')
  if (!report.shareExpiresAt || report.shareExpiresAt < new Date()) {
    throw new ForbiddenError('Link expirado')
  }

  return report
}
```

### 6.5 Object Storage — Acesso a Arquivos de Relatório

```
REGRA: Arquivos de relatório NUNCA são expostos via URL pública permanente.
Todo acesso a arquivos é via URL pré-assinada com TTL máximo de 1 hora.
```

```typescript
// apps/api/src/shared/utils/storage.ts
export async function getSignedDownloadUrl(storageKey: string, ttlSeconds = 3600) {
  // Usando Cloudflare R2 (compatível com AWS S3 SDK)
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: storageKey,
  })

  return getSignedUrl(s3Client, command, { expiresIn: ttlSeconds })
}
```

### 6.6 Rate Limiting e Proteção contra Abuso

```typescript
// Limites por rota — registrar como plugin Fastify
const rateLimits = {
  '/auth/login':         { max: 5,   timeWindow: '15 minutes' }, // brute force
  '/auth/refresh':       { max: 10,  timeWindow: '1 minute' },
  '/api/reports/generate': { max: 3, timeWindow: '1 hour' },    // geração é cara
  '/api/*':              { max: 100, timeWindow: '1 minute' },   // default
}
```

### 6.7 Validação de Entrada

```
REGRA: Toda entrada de dados (body, query, params) deve ser validada com Zod
antes de chegar ao service. O Fastify rejeita automaticamente payloads inválidos.
```

```typescript
// Nunca confiar no input do usuário — validar tudo
const CreateClientSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(50),
}).strict() // rejeitar campos extras

// IDs sempre validados como UUID
const UuidSchema = z.string().uuid()
```

### 6.8 Auditoria Obrigatória

Registrar `AuditLog` para todas as operações nas seguintes categorias:

| Operação | Obrigatório |
|---|---|
| Login / Logout | Sim |
| Criação / edição / exclusão de Cliente | Sim |
| Vinculação de conta de anúncio | Sim |
| Rotação de token no Vault | Sim |
| Geração de relatório | Sim |
| Geração de link compartilhável | Sim |
| Acesso de CLIENT_VIEWER a relatório | Sim |
| Mudança de permissões de usuário | Sim |

```typescript
// Helper de auditoria — usar em todo service que modifica dados
export async function audit(
  db: PrismaClient,
  action: string,
  resource: { type: string; id: string },
  options: { userId?: string; before?: object; after?: object; req?: FastifyRequest }
) {
  // Remover campos sensíveis antes de logar
  const sanitize = (obj?: object) => omit(obj, ['passwordHash', 'accessToken', 'refreshToken'])

  await db.auditLog.create({
    data: {
      userId: options.userId,
      action,
      resourceType: resource.type,
      resourceId: resource.id,
      before: sanitize(options.before),
      after: sanitize(options.after),
      ipAddress: options.req?.ip,
      userAgent: options.req?.headers['user-agent'],
    }
  })
}
```

### 6.9 Headers de Segurança

Configurar via middleware Fastify (ou Helmet):

```typescript
// Obrigatório em produção
app.register(helmet, {
  contentSecurityPolicy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  referrerPolicy: { policy: 'same-origin' },
})
```

### 6.10 Segredos e Variáveis de Ambiente

```
REGRA: Qualquer valor que começa com sk_, pk_, token, secret, password, key
nunca deve aparecer em logs, respostas de API, ou mensagens de erro.
```

```typescript
// Redaction automática nos logs (Pino)
const logger = pino({
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.accessToken', '*.refreshToken', '*.key'],
    censor: '[REDACTED]'
  }
})
```

---

## 7. Integrações com Plataformas de Anúncios

### Normalização de Métricas

Toda plataforma retorna dados em formatos diferentes. O `Normalizer` é responsável por converter para o schema unificado (`MetricSnapshot`) antes de persistir.

```typescript
// packages/metrics-schema/normalizer.ts

export interface NormalizedMetric {
  date: string           // YYYY-MM-DD
  platform: Platform
  externalAccountId: string
  impressions: number
  clicks: number
  spend: number          // sempre em BRL (converter se necessário)
  conversions: number
  revenue?: number
  rawData: unknown       // dados originais para debug
}

// Cada plataforma implementa este contrato
export interface PlatformAdapter {
  fetchMetrics(accountId: string, token: string, dateRange: DateRange): Promise<NormalizedMetric[]>
  refreshToken(refreshToken: string): Promise<TokenResponse>
  validateToken(accessToken: string): Promise<boolean>
}
```

### Meta Ads — Detalhes da Integração

```typescript
// apps/workers/meta-ads-sync/meta-adapter.ts

const META_API_VERSION = 'v20.0'
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

// Campos solicitados na API
const INSIGHTS_FIELDS = [
  'date_start', 'date_stop',
  'impressions', 'clicks', 'spend',
  'actions',           // conversões estão aqui (tipo 'offsite_conversion.fb_pixel_purchase')
  'action_values',     // receita das conversões
  'reach', 'frequency',
].join(',')

// Rate limit da Meta: 200 calls / hora por app_id / ad_account
// Implementar debounce e respeitar o header X-Business-Use-Case-Usage
```

### Adicionando Nova Plataforma

Para adicionar uma nova plataforma de anúncios:

1. Adicionar o valor ao enum `Platform` no schema Prisma e rodar migration
2. Criar o adapter em `apps/workers/{platform}-ads-sync/`
3. Implementar a interface `PlatformAdapter`
4. Registrar a fila em `packages/shared-types/queues.ts`
5. Configurar o cron no scheduler
6. Adicionar as variáveis de ambiente OAuth (client_id, client_secret) no Vault

---

## 8. Módulo de IA Híbrida

### Arquitetura

O sistema usa dois motores em paralelo, orquestrados pelo `AiOrchestrator`:

```
Evento (nova sync / trigger manual / cron diário)
    │
    ▼
AiOrchestrator
    ├── RulesEngine  → resposta imediata, sem custo de API
    │   └── AlertasCríticos: CPA > limite, ROAS < meta, budget quase esgotado
    │
    └── LlmEngine (Claude API) → análise profunda, sob demanda
        └── Resumo semanal, análise comparativa, sugestões estratégicas
    │
    ▼
AiInsightAggregator → deduplica, prioriza, persiste
```

### Rules Engine

```typescript
// apps/workers/ai-insights/rules/index.ts

export const RULES: Rule[] = [
  {
    id: 'high-cpa',
    name: 'CPA acima do limite',
    severity: 'WARNING',
    evaluate: (metrics, config) => {
      const cpa = metrics.spend / (metrics.conversions || 1)
      const limit = config.maxCpa || Infinity
      return cpa > limit
        ? { triggered: true, message: `CPA de R$${cpa.toFixed(2)} acima do limite de R$${limit}` }
        : { triggered: false }
    }
  },
  {
    id: 'low-roas',
    name: 'ROAS abaixo da meta',
    severity: 'CRITICAL',
    evaluate: (metrics, config) => {
      const roas = (metrics.revenue || 0) / (metrics.spend || 1)
      const target = config.targetRoas || 1
      return roas < target
        ? { triggered: true, message: `ROAS de ${roas.toFixed(2)}x abaixo da meta de ${target}x` }
        : { triggered: false }
    }
  },
  // ... mais regras
]
```

### LLM Engine (Claude API)

```typescript
// apps/workers/ai-insights/llm/claude-engine.ts

export async function generateInsight(
  type: InsightType,
  context: InsightContext
): Promise<string> {

  // SEMPRE injetar contexto estruturado no prompt
  // NUNCA enviar dados de outros clientes no contexto
  const prompt = buildPrompt(type, context)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

const SYSTEM_PROMPT = `
Você é um analista especialista em tráfego pago da agência XGO Midia.
Seu papel é analisar os dados de performance de campanhas e gerar insights
acionáveis para os gestores de tráfego.

Diretrizes:
- Seja objetivo e direto — os insights devem ser práticos, não genéricos
- Sempre que apontar um problema, sugira uma ação corretiva específica
- Use linguagem profissional mas acessível
- Responda sempre em português brasileiro
- Não invente dados que não estejam no contexto fornecido
`

function buildPrompt(type: InsightType, ctx: InsightContext): string {
  return `
## Contexto
Cliente: ${ctx.clientName}
Estratégia: ${ctx.strategyName} (${ctx.funnelType})
Período: ${ctx.dateRange.from} a ${ctx.dateRange.to}

## Métricas do período
- Investimento: R$ ${ctx.metrics.spend.toFixed(2)}
- Impressões: ${ctx.metrics.impressions.toLocaleString('pt-BR')}
- Cliques: ${ctx.metrics.clicks.toLocaleString('pt-BR')}
- CTR: ${ctx.metrics.ctr.toFixed(2)}%
- CPC: R$ ${ctx.metrics.cpc.toFixed(2)}
- Conversões: ${ctx.metrics.conversions}
- CPA: R$ ${ctx.metrics.cpa.toFixed(2)}
- ROAS: ${ctx.metrics.roas.toFixed(2)}x
${ctx.goals ? `\n## Metas definidas\n${JSON.stringify(ctx.goals, null, 2)}` : ''}
${ctx.previousPeriod ? `\n## Período anterior (comparativo)\n${JSON.stringify(ctx.previousPeriod, null, 2)}` : ''}
${ctx.activeAlerts?.length ? `\n## Alertas ativos\n${ctx.activeAlerts.join('\n')}` : ''}

## Solicitação
${getPromptByType(type)}
`
}
```

**Controle de custos da API:**
- Insights de LLM só são gerados quando: (a) solicitados manualmente, (b) cron semanal, ou (c) o Rules Engine detecta algo crítico que requer análise aprofundada
- Manter log de tokens consumidos por cliente (`AiInsight.metadata`) para gestão de custos
- Implementar cache de 24h: se já foi gerado um insight do mesmo tipo para a mesma estratégia hoje, retornar o cache

---

## 9. Sistema de Relatórios

### Fluxo de Geração

```
1. API recebe solicitação de relatório (ou scheduler dispara)
2. Cria registro Report com status PENDING
3. Enfileira job em report-render queue
4. Worker renderiza o documento
5. Worker faz upload para R2 Storage
6. Worker atualiza Report: status=DONE, storageKey=...
7. Worker enfileira job de notificação
8. Notifications worker envia e-mail com link pré-assinado (TTL 72h)
```

### Geração de PDF

```typescript
// apps/workers/report-renderer/pdf-renderer.ts

export async function renderPdf(reportId: string): Promise<string> {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // obrigatório em container
  })

  const page = await browser.newPage()

  // Renderizar via rota interna autenticada (não via URL pública)
  const internalToken = generateInternalToken(reportId) // token de uso único, TTL 5min
  await page.goto(`${env.INTERNAL_URL}/reports/render/${reportId}?token=${internalToken}`, {
    waitUntil: 'networkidle0'
  })

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' }
  })

  await browser.close()

  // Upload para R2
  const storageKey = `reports/${reportId}/${Date.now()}.pdf`
  await uploadToStorage(storageKey, pdf)

  return storageKey
}
```

### Geração de PPT

```typescript
// apps/workers/report-renderer/ppt-renderer.ts
import pptxgen from 'pptxgenjs'

export async function renderPpt(reportData: ReportData): Promise<Buffer> {
  const prs = new pptxgen()

  // Slide de capa
  const coverSlide = prs.addSlide()
  coverSlide.addText(reportData.clientName, { x: 0.5, y: 1.5, fontSize: 28, bold: true })
  coverSlide.addText(`Relatório de Performance — ${reportData.period}`, { x: 0.5, y: 2.2, fontSize: 16 })

  // Slide de métricas principais
  const metricsSlide = prs.addSlide()
  // ... adicionar tabelas e gráficos

  return prs.write({ outputType: 'nodebuffer' }) as Promise<Buffer>
}
```

---

## 10. Autenticação e Controle de Acesso

### Fluxo de Login

```
POST /auth/login
  → Validar email + senha (bcrypt.compare)
  → Gerar access token JWT (15min)
  → Gerar refresh token aleatório
  → Armazenar HASH do refresh token no banco
  → Retornar access token no body
  → Definir refresh token em cookie httpOnly
```

### Fluxo de Refresh

```
POST /auth/refresh
  → Ler refresh token do cookie httpOnly
  → Calcular SHA-256 do token recebido
  → Buscar no banco pelo hash
  → Verificar se não está revogado e não expirou
  → Revogar o token atual (rotação obrigatória)
  → Emitir novo par (access token + refresh token)
```

### Middleware de Autenticação

```typescript
// apps/api/src/shared/middleware/auth.middleware.ts

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError()

  const token = authHeader.slice(7)

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload
    request.user = payload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Token expirado')
    throw new UnauthorizedError('Token inválido')
  }
}

// Decorator de permissão — usar em rotas que precisam de role específica
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError('Permissão insuficiente')
    }
  }
}
```

---

## 11. Variáveis de Ambiente

**Nunca commitar valores reais. Usar `.env.example` com valores fictícios.**

```bash
# .env.example

# ─── App ───────────────────────────────
NODE_ENV=development
PORT=3001
PUBLIC_URL=https://app.xgomidia.com.br
INTERNAL_URL=http://api:3001

# ─── Banco de Dados ────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/xgo_platform

# ─── Redis ─────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── JWT ───────────────────────────────
JWT_SECRET=troque-por-valor-gerado-com-openssl-rand-base64-64
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# ─── Vault (HashiCorp) ─────────────────
VAULT_ADDR=https://vault.internal:8200
VAULT_TOKEN=root  # apenas dev — em prod usar AppRole
VAULT_MOUNT=secret

# ─── Object Storage (Cloudflare R2) ────
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=xgo-reports

# ─── IA (Anthropic) ────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ─── E-mail (Resend) ───────────────────
RESEND_API_KEY=re_...
EMAIL_FROM=relatorios@xgomidia.com.br

# ─── Meta Ads OAuth ────────────────────
# ATENÇÃO: nunca colocar tokens de cliente aqui — usar Vault
META_APP_ID=
META_APP_SECRET=   # vai para Vault também

# ─── Sentry ────────────────────────────
SENTRY_DSN=
```

**Em produção:** Todas as variáveis marcadas como sensíveis (`*_SECRET`, `*_KEY`, `*_TOKEN`) devem ser injetadas pelo Vault ou pelo secret manager do Kubernetes — nunca em arquivos `.env` em produção.

---

## 12. Fluxos Principais — Passo a Passo

### Vincular Conta de Anúncio (Meta Ads OAuth)

```
1. Usuário clica em "Conectar Meta Ads"
2. Frontend redireciona para URL OAuth da Meta
   (scope: ads_read, ads_management, business_management)
3. Usuário autoriza → Meta redireciona para /auth/meta/callback?code=...
4. API troca o code pelo access_token + refresh_token via Meta Graph API
5. API armazena tokens no Vault:
   path: secret/clients/{clientId}/meta-ads/{externalAccountId}
6. API cria registro AdAccount com vaultSecretPath
7. API enfileira job de sync inicial (MetaAdsSyncJob)
8. Worker executa sync dos últimos 90 dias
```

### Gerar Relatório PDF por E-mail

```
1. POST /api/reports  { clientId, strategyId, type: "PDF", config: {...} }
2. Criar Report com status PENDING
3. Enfileirar job: REPORT_RENDER queue
4. [Worker] Buscar dados do relatório no banco
5. [Worker] Gerar token interno de renderização (uso único, 5min)
6. [Worker] Puppeteer renderiza /reports/render/{id}?token=...
7. [Worker] Upload PDF para R2: reports/{clientId}/{reportId}.pdf
8. [Worker] Atualizar Report: status=DONE, storageKey=...
9. [Worker] Enfileirar: NOTIFICATIONS queue
10. [Worker] Gerar URL pré-assinada (TTL 72h)
11. [Notifications Worker] Enviar e-mail com o link pré-assinado
```

---

## 13. Padrões de Código

### Tratamento de Erros

```typescript
// Nunca expor detalhes internos ao cliente
// ✅ Correto
throw new AppError('Cliente não encontrado', 404, 'CLIENT_NOT_FOUND')

// ❌ Errado — vaza informação interna
throw new Error(`Prisma error: P2025 - Record not found in table 'clients'`)
```

### Respostas da API

```typescript
// Formato padrão de resposta
interface ApiResponse<T> {
  data: T
  meta?: { page?: number; total?: number }
}

interface ApiError {
  error: { code: string; message: string }
}

// Exemplo de endpoint
fastify.get('/clients/:id', {
  preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')]
}, async (request, reply) => {
  const { id } = UuidSchema.parse(request.params)

  await assertClientAccess(request.user.sub, request.user.role, id, db)

  const client = await clientsService.findById(id)
  if (!client) throw new NotFoundError('Cliente não encontrado')

  return reply.send({ data: client })
})
```

### Testes

- Todo `service` deve ter testes unitários com mocks do repository
- Todo endpoint deve ter ao menos um teste de integração (usando banco em memória ou test container)
- Cenários de segurança obrigatórios: tentar acessar dados de outro cliente, tentar usar token expirado, tentar usar role insuficiente

---

## 14. Roadmap de Fases

### Fase 1 — MVP (6-8 semanas)

- [ ] Infraestrutura base: Docker Compose, Postgres, Redis, Vault (dev mode)
- [ ] Autenticação JWT + RBAC (3 roles)
- [ ] CRUD completo: Clientes, Projetos, Estratégias
- [ ] Integração Meta Ads (OAuth + sync de métricas)
- [ ] Dashboard geral da agência (métricas consolidadas)
- [ ] Dashboard por estratégia (métricas customizáveis)
- [ ] Rules Engine básico (5 alertas principais)
- [ ] Linha do tempo de ações por cliente

### Fase 2 — Relatórios e IA (4-6 semanas)

- [ ] Geração de PDF (Puppeteer)
- [ ] Geração de PPT (pptxgenjs)
- [ ] Links compartilháveis com expiração
- [ ] Portal do cliente (CLIENT_VIEWER)
- [ ] LLM Engine (Claude API) — insights semanais
- [ ] Chat de IA por estratégia
- [ ] Envio de relatórios por e-mail

### Fase 3 — Expansão de Plataformas (4 semanas)

- [ ] Google Ads (adapter + worker)
- [ ] TikTok Ads (adapter + worker)
- [ ] Dashboard comparativo entre plataformas
- [ ] Agendamento automático de relatórios
- [ ] Notificações push (alertas críticos)
- [ ] Audit log viewer para AGENCY_ADMIN

---

## Contatos e Referências

- **Repositório:** `github.com/xgo-midia/platform` (privado)
- **Documentação da Meta Marketing API:** https://developers.facebook.com/docs/marketing-apis
- **Documentação do Anthropic:** https://docs.anthropic.com
- **HashiCorp Vault:** https://developer.hashicorp.com/vault/docs
- **BullMQ:** https://docs.bullmq.io

---

*Última atualização: gerado com Claude — revisar e manter atualizado a cada sprint.*
