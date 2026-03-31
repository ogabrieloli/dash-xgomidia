import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Agência principal
  const agency = await db.agency.upsert({
    where: { slug: 'xgo-midia' },
    update: {},
    create: {
      name: 'XGO Midia',
      slug: 'xgo-midia',
    },
  })

  // Admin da agência
  const adminPassword = await bcrypt.hash('admin123!', 12)
  const admin = await db.user.upsert({
    where: { email: 'admin@xgomidia.com.br' },
    update: {},
    create: {
      email: 'admin@xgomidia.com.br',
      passwordHash: adminPassword,
      role: 'AGENCY_ADMIN',
      agencyId: agency.id,
    },
  })

  // Cliente de exemplo
  const client = await db.client.upsert({
    where: { slug: 'cliente-demo' },
    update: {},
    create: {
      agencyId: agency.id,
      name: 'Cliente Demo',
      slug: 'cliente-demo',
    },
  })

  // Projeto de exemplo
  const project = await db.project.create({
    data: {
      clientId: client.id,
      name: 'Infoprodutos 2025',
      description: 'Estratégias de vendas para infoprodutos',
    },
  })

  // Estratégia de exemplo
  await db.strategy.create({
    data: {
      projectId: project.id,
      name: 'Webinário de Vendas',
      funnelType: 'WEBINAR',
      metricConfig: {
        visibleMetrics: ['spend', 'roas', 'cpa', 'conversions'],
        goalRoas: 3.0,
        maxCpa: 80.0,
      },
    },
  })

  console.log(`✅ Agency: ${agency.name}`)
  console.log(`✅ Admin: ${admin.email} (senha: admin123!)`)
  console.log(`✅ Client: ${client.name}`)
  console.log(`✅ Project: ${project.name}`)
  console.log('🌱 Seed concluído!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
