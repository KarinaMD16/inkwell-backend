import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/** Dónde se guardan los archivos subidos. Las pruebas lo reemplazan por uno en memoria. */
export interface FileStorage {
  /** Guarda el archivo y devuelve su URL pública. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  /** Borra un archivo a partir de su URL pública. Ignora URLs que no son de este almacenamiento. */
  removeByUrl(url: string): Promise<void>;
}
export const STORAGE = Symbol('STORAGE');

/**
 * Almacenamiento compatible con S3. Funciona igual con Supabase Storage y con Cloudflare R2:
 * para mudarse basta cambiar las variables STORAGE_* y copiar los archivos.
 */
@Injectable()
export class S3Storage implements FileStorage {
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(@Inject(ENV) env: Env) {
    const ready = env.STORAGE_ENDPOINT && env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY && env.STORAGE_PUBLIC_URL;
    this.bucket = env.STORAGE_BUCKET ?? '';
    this.publicUrl = (env.STORAGE_PUBLIC_URL ?? '').replace(/\/$/, '');
    this.client = ready
      ? new S3Client({
          endpoint: env.STORAGE_ENDPOINT,
          region: env.STORAGE_REGION,
          forcePathStyle: true,
          credentials: { accessKeyId: env.STORAGE_ACCESS_KEY_ID!, secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY! },
        })
      : null;
  }

  private s3(): S3Client {
    if (!this.client) throw new ServiceUnavailableException('La subida de imágenes todavía no está configurada en el servidor');
    return this.client;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.s3().send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body, ContentType: contentType,
      // Cada subida usa un nombre nuevo, así que el archivo nunca cambia: se puede cachear para siempre.
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return `${this.publicUrl}/${key}`;
  }

  async removeByUrl(url: string): Promise<void> {
    if (!this.client || !url.startsWith(`${this.publicUrl}/`)) return;
    const key = decodeURIComponent(url.slice(this.publicUrl.length + 1));
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
