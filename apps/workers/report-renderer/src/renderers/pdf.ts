/**
 * Renderiza relatório PDF usando Puppeteer.
 *
 * Fluxo:
 *  1. Gera token interno de uso único (TTL 5min) para rota de preview
 *  2. Abre a página no browser headless
 *  3. Aguarda o seletor #report-ready (indicador que os dados carregaram)
 *  4. Imprime para PDF
 */
import puppeteer from 'puppeteer'

export async function renderPdf(
  reportId: string,
  previewToken: string,
): Promise<Buffer> {
  const baseUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000'
  const url = `${baseUrl}/reports/preview/${reportId}?token=${previewToken}`

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 900 })

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 })

    // Aguarda indicador de dados carregados
    await page.waitForSelector('#report-ready', { timeout: 30_000 }).catch(() => {
      // Continua mesmo sem o seletor — alguns relatórios simples não o têm
    })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
