import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly presignTtl: number;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
    const port     = process.env.MINIO_PORT ?? '9000';
    const access   = process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
    const secret   = process.env.MINIO_SECRET_KEY ?? 'minioadmin';

    this.bucket     = process.env.MINIO_BUCKET_EXAMS ?? 'exam-pdfs';
    this.presignTtl = 3600; // 1 saat

    // Cloudflare R2 gibi full URL endpoint'leri destekle
    // (örn: https://<account>.r2.cloudflarestorage.com)
    const isFullUrl = endpoint.startsWith('http://') || endpoint.startsWith('https://');
    const endpointUrl = isFullUrl
      ? endpoint
      : `http://${endpoint}:${port}`;

    this.client = new S3Client({
      endpoint:       endpointUrl,
      region:         'auto',         // R2 için 'auto', MinIO için herhangi değer çalışır
      forcePathStyle: !isFullUrl,     // MinIO gerektirir; R2 gerektirmez
      credentials: { accessKeyId: access, secretAccessKey: secret },
    });
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`MinIO bucket oluşturuldu: ${this.bucket}`);
      } catch (err) {
        this.logger.warn(`Bucket oluşturulamadı: ${err}`);
      }
    }
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  async upload(key: string, body: Buffer, contentType = 'application/pdf'): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket:      this.bucket,
        Key:         key,
        Body:        body,
        ContentType: contentType,
      }),
    );
  }

  // ─── Presigned URL ────────────────────────────────────────────────────────

  async presignedUrl(key: string): Promise<{ url: string; expiresAt: string }> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, command, { expiresIn: this.presignTtl });

    const expiresAt = new Date(Date.now() + this.presignTtl * 1000).toISOString();
    return { url, expiresAt };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
