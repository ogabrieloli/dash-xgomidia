/**
 * Gera apresentação PPT usando pptxgenjs.
 *
 * Estrutura dos slides:
 *  1. Capa — título, cliente, período
 *  2. KPIs — ROAS, CPA, CTR, CPM, Invest, Receita
 *  3. Gráfico de barras de métricas
 *  4. Notas e próximos passos
 */
// pptxgenjs CJS interop — the CJS build exports the constructor directly
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const PptxGenJS: any = require('pptxgenjs')

interface ReportConfig {
  dateRange?: { from: string; to: string } | undefined
  clientName?: string | undefined
  metrics?: {
    roas?: number | undefined
    cpa?: number | undefined
    ctr?: number | undefined
    cpm?: number | undefined
    totalSpend?: number | undefined
    totalRevenue?: number | undefined
  } | undefined
  notes?: string | undefined
}

export async function renderPpt(
  title: string,
  config: ReportConfig,
): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.author = 'XGO Midia'
  pptx.title = title

  const BRAND_BLUE = '1E40AF'
  const LIGHT_GRAY = 'F1F5F9'

  // ─── Slide 1: Capa ───────────────────────────────────────
  const cover = pptx.addSlide()
  cover.background = { color: BRAND_BLUE }

  cover.addText(title, {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 1.2,
    fontSize: 32,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
  })

  if (config.clientName) {
    cover.addText(config.clientName, {
      x: 0.5,
      y: 2.9,
      w: 9,
      h: 0.6,
      fontSize: 18,
      color: 'BFDBFE',
      align: 'center',
    })
  }

  const period = config.dateRange
    ? `${config.dateRange.from} — ${config.dateRange.to}`
    : new Date().getFullYear().toString()

  cover.addText(period, {
    x: 0.5,
    y: 3.7,
    w: 9,
    h: 0.4,
    fontSize: 14,
    color: '93C5FD',
    align: 'center',
  })

  // ─── Slide 2: KPIs ───────────────────────────────────────
  const kpiSlide = pptx.addSlide()
  kpiSlide.background = { color: 'FFFFFF' }

  kpiSlide.addText('Indicadores de Performance', {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.7,
    fontSize: 22,
    bold: true,
    color: '1E293B',
  })

  const metrics = config.metrics ?? {}
  const kpis = [
    { label: 'ROAS', value: metrics.roas != null ? metrics.roas.toFixed(2) + 'x' : '—' },
    { label: 'CPA', value: metrics.cpa != null ? 'R$ ' + metrics.cpa.toFixed(2) : '—' },
    { label: 'CTR', value: metrics.ctr != null ? metrics.ctr.toFixed(2) + '%' : '—' },
    { label: 'CPM', value: metrics.cpm != null ? 'R$ ' + metrics.cpm.toFixed(2) : '—' },
    { label: 'Investimento', value: metrics.totalSpend != null ? 'R$ ' + metrics.totalSpend.toFixed(2) : '—' },
    { label: 'Receita', value: metrics.totalRevenue != null ? 'R$ ' + metrics.totalRevenue.toFixed(2) : '—' },
  ]

  const cols = 3
  kpis.forEach((kpi, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = 0.5 + col * 3.1
    const y = 1.3 + row * 1.4

    kpiSlide.addShape(pptx.ShapeType.rect, {
      x, y, w: 2.8, h: 1.1,
      fill: { color: LIGHT_GRAY },
      line: { color: 'E2E8F0', width: 1 },
    })

    kpiSlide.addText(kpi.value, {
      x, y: y + 0.05, w: 2.8, h: 0.65,
      fontSize: 22,
      bold: true,
      color: BRAND_BLUE,
      align: 'center',
    })

    kpiSlide.addText(kpi.label, {
      x, y: y + 0.65, w: 2.8, h: 0.35,
      fontSize: 12,
      color: '64748B',
      align: 'center',
    })
  })

  // ─── Slide 3: Notas ───────────────────────────────────────
  if (config.notes) {
    const notesSlide = pptx.addSlide()
    notesSlide.background = { color: 'FFFFFF' }

    notesSlide.addText('Observações', {
      x: 0.5, y: 0.3, w: 9, h: 0.7,
      fontSize: 22, bold: true, color: '1E293B',
    })

    notesSlide.addText(config.notes, {
      x: 0.5, y: 1.2, w: 9, h: 4,
      fontSize: 14, color: '475569',
      bullet: false,
    })
  }

  // Retorna buffer — pptxgenjs retorna Buffer quando outputType é 'nodebuffer'
  const result: Buffer = await pptx.write({ outputType: 'nodebuffer' })
  return result
}
