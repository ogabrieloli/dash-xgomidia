import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
  },
})

const BUCKET = process.env['R2_BUCKET_NAME'] ?? 'xgo-reports'

/**
 * Gera URL pré-assinada para download de arquivo.
 *
 * REGRA: Arquivos de relatório NUNCA são expostos via URL pública permanente.
 * TTL máximo: 1 hora (3600s). Para links compartilháveis usar shareToken.
 */
export async function getSignedDownloadUrl(
  storageKey: string,
  ttlSeconds = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  })

  return getSignedUrl(s3Client, command, { expiresIn: ttlSeconds })
}

/**
 * Faz upload de arquivo para o R2 Storage.
 */
export async function uploadToStorage(
  storageKey: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    Body: body,
    ContentType: contentType,
  })

  await s3Client.send(command)
}

/**
 * Remove arquivo do R2 Storage.
 */
export async function deleteFromStorage(storageKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  })

  await s3Client.send(command)
}
