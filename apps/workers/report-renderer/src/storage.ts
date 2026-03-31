import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
  },
})

const BUCKET = process.env['R2_BUCKET_NAME'] ?? 'xgo-reports'

export async function uploadToStorage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  )
}
