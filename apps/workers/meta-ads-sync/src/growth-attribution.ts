/**
 * Atribuição de crescimento de seguidores via Instagram + Meta Ads.
 *
 * Distribui os seguidores ganhos no dia proporcionalmente às visitas ao perfil
 * por campanha (profileVisits), gerando SocialAttributionSnapshot.
 */
import type { PrismaClient } from '@prisma/client'
import { subDays, format } from 'date-fns'

const META_API_VERSION = 'v25.0'
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`

/**
 * Coleta o follower count do Instagram Business Account vinculado ao token,
 * salva um InstagramSnapshot (apenas 1x por dia por cliente) e retorna o igUserId.
 */
export async function collectInstagramSnapshot(
  db: PrismaClient,
  clientId: string,
  accessToken: string,
): Promise<string | null> {
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Verificar se já coletamos hoje
  const existing = await db.instagramSnapshot.findFirst({
    where: { clientId, collectedAt: { gte: new Date(todayStr) } },
  })
  if (existing) return existing.igUserId

  // Buscar Instagram Business Account vinculada ao token
  const res = await fetch(
    `${META_GRAPH_URL}/me?fields=instagram_business_account{id,followers_count,media_count}&access_token=${accessToken}`,
  )
  if (!res.ok) return null

  const data = await res.json() as {
    instagram_business_account?: { id: string; followers_count: number; media_count: number }
  }
  const ig = data.instagram_business_account
  if (!ig) return null

  await db.instagramSnapshot.create({
    data: {
      clientId,
      igUserId: ig.id,
      followersCount: ig.followers_count,
      mediaCount: ig.media_count,
    },
  })

  return ig.id
}

/**
 * Calcula a atribuição de seguidores ganhos para uma data específica.
 * Requer InstagramSnapshot de `date` e de `date - 1`.
 */
export async function attributeGrowth(
  db: PrismaClient,
  clientId: string,
  date: Date,
): Promise<void> {
  const dateStr = format(date, 'yyyy-MM-dd')
  const prevDateStr = format(subDays(date, 1), 'yyyy-MM-dd')
  const nextDateStr = format(subDays(date, -1), 'yyyy-MM-dd')

  // 1. Buscar snapshots do Instagram (date e date-1)
  const [todayIg, prevIg] = await Promise.all([
    db.instagramSnapshot.findFirst({
      where: { clientId, collectedAt: { gte: new Date(dateStr), lt: new Date(nextDateStr) } },
      orderBy: { collectedAt: 'desc' },
    }),
    db.instagramSnapshot.findFirst({
      where: { clientId, collectedAt: { gte: new Date(prevDateStr), lt: new Date(dateStr) } },
      orderBy: { collectedAt: 'desc' },
    }),
  ])

  if (!todayIg || !prevIg) return

  const followersGainedTotal = todayIg.followersCount - prevIg.followersCount

  // 2. Buscar visitas ao perfil por campanha no dia
  const adsMetrics = await db.metricSnapshot.findMany({
    where: {
      adAccount: { clientId },
      date: { gte: new Date(dateStr), lte: new Date(dateStr) },
      platform: 'META_ADS',
      NOT: { externalCampaignId: null },
    },
  })

  const totalProfileVisits = adsMetrics.reduce((sum, m) => sum + m.profileVisits, 0)
  if (totalProfileVisits === 0) return

  // 3. Distribuir seguidores proporcionalmente por profileVisits
  for (const metric of adsMetrics) {
    const weight = metric.profileVisits / totalProfileVisits
    const followersEstimated = followersGainedTotal * weight

    await db.socialAttributionSnapshot.upsert({
      where: {
        adAccountId_date_externalCampaignId: {
          adAccountId: metric.adAccountId,
          date: new Date(dateStr),
          externalCampaignId: metric.externalCampaignId!,
        },
      },
      create: {
        adAccountId: metric.adAccountId,
        date: new Date(dateStr),
        externalCampaignId: metric.externalCampaignId!,
        followersGainedTotal,
        profileVisits: metric.profileVisits,
        attributionWeight: weight,
        followersEstimated,
      },
      update: {
        followersGainedTotal,
        profileVisits: metric.profileVisits,
        attributionWeight: weight,
        followersEstimated,
      },
    })
  }
}
