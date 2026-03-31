/**
 * Templates de e-mail HTML para notificações.
 */

interface ReportReadyParams {
  recipientName: string
  reportTitle: string
  reportType: string
  clientName: string
  downloadUrl: string
  expiresAt: string
}

export function reportReadyTemplate(params: ReportReadyParams): {
  subject: string
  html: string
} {
  const typeLabel = params.reportType === 'PDF' ? 'PDF' : 'Apresentação (PPT)'

  return {
    subject: `[XGO Midia] Relatório pronto: ${params.reportTitle}`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <!-- Header -->
        <tr><td style="background:#1E40AF;padding:24px 32px;">
          <h1 style="margin:0;color:#FFFFFF;font-size:20px;font-weight:700;">XGO Midia</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;color:#1E293B;font-size:16px;">Olá!</p>
          <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
            O relatório <strong>${params.reportTitle}</strong> (${typeLabel}) do cliente
            <strong>${params.clientName}</strong> foi gerado com sucesso e está pronto para download.
          </p>

          <!-- CTA Button -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="background:#1E40AF;border-radius:8px;padding:14px 28px;">
              <a href="${params.downloadUrl}"
                 style="color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;">
                Baixar ${typeLabel}
              </a>
            </td></tr>
          </table>

          <p style="margin:0;color:#94A3B8;font-size:13px;">
            Este link expira em ${params.expiresAt}. Após expirar, acesse a plataforma para gerar um novo link.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #E2E8F0;">
          <p style="margin:0;color:#94A3B8;font-size:12px;">
            Você recebeu este e-mail porque é gestor na plataforma XGO Midia.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  }
}
