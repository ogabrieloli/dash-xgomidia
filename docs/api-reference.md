# API Endpoints Reference

Documentação das rotas disponíveis na API da XGO Midia Platform.

## Base URL
- **Local:** `http://localhost:3001`
- **Produção:** `https://api.xgomidia.com.br`

## Autenticação

| Método | Rota | Descrição | Roles |
|---|---|---|---|
| POST | `/auth/login` | Autenticação inicial (email/password) | Todos |
| POST | `/auth/refresh` | Renovação de tokens via Cookie | Todos |
| GET | `/auth/me` | Dados do usuário logado | Todos |
| POST | `/auth/meta/callback` | Callback para OAuth da Meta Ads | AGENCY_ADMIN |

## Gestão de Clientes (`/api/clients`)

| Método | Rota | Descrição | Roles |
|---|---|---|---|
| GET | `/` | Lista clientes da agência | ADMIN, MANAGER |
| GET | `/:id` | Detalhes de um cliente | Todos (com acesso) |
| POST | `/` | Cria novo cliente | ADMIN, MANAGER |
| PATCH | `/:id` | Atualiza dados do cliente | ADMIN, MANAGER |
| DELETE | `/:id` | Exclusão lógica (soft delete) | ADMIN |

## Métricas e IA (`/api/metrics`, `/api/insights`, `/api/ai`)

| Método | Rota | Descrição | Roles |
|---|---|---|---|
| GET | `/api/metrics` | Busca métricas filtradas por período e conta | Todos (com acesso) |
| GET | `/api/insights` | Lista insights/alertas gerados | Todos (com acesso) |
| PATCH | `/api/insights/:id/read` | Marca insight como lido | Todos (com acesso) |
| POST | `/api/ai/chat` | Chat interativo sobre performance | Todos (com acesso) |
| POST | `/api/ai/insights/generate` | Dispara geração manual de insight LLM | ADMIN, MANAGER |

## Relatórios (`/api/reports`)

| Método | Rota | Descrição | Roles |
|---|---|---|---|
| GET | `/` | Lista relatórios gerados/pendentes | Todos (com acesso) |
| POST | `/` | Solicita geração de novo relatório (PDF/PPT) | ADMIN, MANAGER |
| GET | `/r/:token` | Acesso público a relatório compartilhado | Público |

---
*Para detalhes de parâmetros e payloads, consulte os arquivos `*.schema.ts` no código fonte.*
