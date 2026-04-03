import type { PrismaClient } from '@prisma/client'
import { subDays, format } from 'date-fns'

export class SocialAttributionService {
    constructor(private readonly db: PrismaClient) { }

    /**
     * Executa o processo de atribuição para um cliente em uma data específica.
     */
    async attributeClientSocialMetrics(clientId: string, date: Date) {
        const dateStr = format(date, 'yyyy-MM-dd')
        const prevDateStr = format(subDays(date, 1), 'yyyy-MM-dd')

        // 1. Buscar snapshots do Instagram (hoje e ontem)
        const [todayIg, prevIg] = await Promise.all([
            this.db.instagramSnapshot.findFirst({
                where: { clientId, collectedAt: { gte: new Date(dateStr), lt: new Date(format(subDays(date, -1), 'yyyy-MM-dd')) } },
                orderBy: { collectedAt: 'desc' }
            }),
            this.db.instagramSnapshot.findFirst({
                where: { clientId, collectedAt: { gte: new Date(prevDateStr), lt: new Date(dateStr) } },
                orderBy: { collectedAt: 'desc' }
            })
        ])

        if (!todayIg || !prevIg) {
            // Sem dados suficientes para calcular crescimento
            return
        }

        const followersGainedTotal = todayIg.followersCount - prevIg.followersCount

        // 2. Buscar visitas ao perfil vindas de Ads (MetricSnapshots)
        const adsMetrics = await this.db.metricSnapshot.findMany({
            where: {
                adAccount: { clientId },
                date: { gte: new Date(dateStr), lte: new Date(dateStr) },
                platform: 'META_ADS',
                NOT: { externalCampaignId: null }
            }
        })

        const totalProfileVisits = adsMetrics.reduce((sum, m) => sum + m.profileVisits, 0)

        if (totalProfileVisits === 0) {
            // Nenhuma visita ao perfil vinda de Ads — atribuir 0 ou ignorar
            return
        }

        // 3. Distribuir seguidores ganhos por campanha
        for (const metric of adsMetrics) {
            const weight = metric.profileVisits / totalProfileVisits
            const followersEstimated = followersGainedTotal * weight

            await this.db.socialAttributionSnapshot.upsert({
                where: {
                    adAccountId_date_externalCampaignId: {
                        adAccountId: metric.adAccountId,
                        date: new Date(dateStr),
                        externalCampaignId: metric.externalCampaignId
                    }
                },
                create: {
                    adAccountId: metric.adAccountId,
                    date: new Date(dateStr),
                    externalCampaignId: metric.externalCampaignId!,
                    followersGainedTotal,
                    profileVisits: metric.profileVisits,
                    attributionWeight: weight,
                    followersEstimated
                },
                update: {
                    followersGainedTotal,
                    profileVisits: metric.profileVisits,
                    attributionWeight: weight,
                    followersEstimated
                }
            })
        }
    }

    /**
     * Recalcula a atribuição para um range de datas.
     */
    async reprocessRange(clientId: string, from: Date, to: Date) {
        let current = from
        while (current <= to) {
            await this.attributeClientSocialMetrics(clientId, current)
            current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
        }
    }
}
