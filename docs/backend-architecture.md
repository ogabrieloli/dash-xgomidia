# Backend Architecture Reference

Esta documentação descreve a arquitetura do servidor de API da XGO Midia Platform.

## Stack Tecnológica
- **Framework:** Fastify 4
- **ORM:** Prisma 5
- **Banco de Dados:** PostgreSQL 16
- **Autenticação:** JWT (Access Token) + Refresh Token (HTTP-only Cookie)
- **Validação:** Zod
- **Cache/Filas:** Redis 7 + BullMQ 4

## Estrutura de Módulos (`apps/api/src/modules`)

O backend é organizado em módulos de domínio. Cada módulo geralmente contém:
- `*.routes.ts`: Definição de rotas e schemas de entrada/saída.
- `*.service.ts`: Lógica de negócio e orquestração.
- `*.repository.ts`: Interação com o banco de dados via Prisma (opcional, dependendo da complexidade).
- `*.schema.ts`: Schemas Zod para validação e tipos TypeScript.

### Módulos Principais
1. **auth**: Gestão de login, registro, logout e rotação de tokens.
2. **clients**: Gestão de clientes da agência (CRUD e isolamento de dados).
3. **ad-accounts**: Conexão com Meta Ads, Google Ads e gestão de tokens no Vault.
4. **metrics**: Agregação de dados de performance das plataformas de anúncios.
5. **ai**: Orquestração de insights (Rules Engine) e Chat com Claude API.
6. **reports**: Geração assíncrona de relatórios PDF/PPT via workers.
7. **timeline**: Histórico de ações e alertas por cliente.

## Fluxos Críticos

### Segurança e Isolamento
- **RBAC:** Implementado via middleware `requireRole`.
- **Client Isolation:** O middleware `assertClientAccess` garante que um usuário só acesse dados de clientes aos quais tem permissão explícita.
- **Vault:** Tokens da Meta/Google NUNCA são salvos no Postgres. O banco guarda apenas o path no Vault.

### Sincronização de Dados
- A API enfileira jobs no Redis (BullMQ).
- Os `workers` processam a sincronização em segundo plano para não onerar o tempo de resposta da API.

---
*Última atualização: Março 2026*
