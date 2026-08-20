import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { envConfig } from '../../config/env.config';

/**
 * DigitalOcean Spaces (S3-compatible). Dos usos:
 * · PRIVADO: comprobantes de transferencia que llegan por WhatsApp (PII
 *   bancaria) — el admin los ve vía URL firmada de corta vida, nunca pública.
 * · PÚBLICO: imágenes del sistema (fotos de piezas, imágenes de
 *   experiencias) — se suben public-read con cache larga y se sirven por la
 *   URL pública del bucket (o el CDN si DO_SPACES_CDN_URL está configurada).
 *
 * Si el bucket no está configurado (DO_SPACES_*), `enabled` es false y quien
 * llama decide qué hacer (ej.: registrar la consulta sin imagen).
 */
@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);
  private client: S3Client | null = null;

  get enabled(): boolean {
    const s = envConfig.spaces;
    return Boolean(s.key && s.secret && s.bucket && s.endpoint);
  }

  private getClient(): S3Client {
    if (!this.client) {
      const s = envConfig.spaces;
      this.client = new S3Client({
        region: s.region,
        endpoint: s.endpoint,
        forcePathStyle: false,
        credentials: { accessKeyId: s.key, secretAccessKey: s.secret },
      });
    }
    return this.client;
  }

  /** Sube un objeto privado. Devuelve el key guardado. */
  async uploadPrivate(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: envConfig.spaces.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'private',
      }),
    );
    this.logger.log(`Objeto subido a Spaces: ${key} (${body.length} bytes)`);
    return key;
  }

  /** URL firmada de corta vida para que el admin vea un objeto privado. */
  async signedUrl(key: string, expiresInSec = 300): Promise<string> {
    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({ Bucket: envConfig.spaces.bucket, Key: key }),
      { expiresIn: expiresInSec },
    );
  }

  /**
   * Sube un objeto PÚBLICO (imágenes del sistema) con cache larga: las
   * imágenes no cambian (los nombres llevan timestamp), así que un año de
   * cache ahorra bandwidth. Devuelve la URL pública.
   */
  async uploadPublic(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: envConfig.spaces.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    this.logger.log(`Imagen pública subida a Spaces: ${key} (${body.length} bytes)`);
    return this.publicUrl(key);
  }

  /** URL pública de un objeto: CDN si está configurado, bucket directo si no. */
  publicUrl(key: string): string {
    const s = envConfig.spaces;
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    if (s.cdnUrl) return `${s.cdnUrl.replace(/\/+$/, '')}/${cleanKey}`;
    // endpoint = https://nyc3.digitaloceanspaces.com → bucket.nyc3.digitaloceanspaces.com
    const host = s.endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${s.bucket}.${host}/${cleanKey}`;
  }

  async deleteObject(key: string): Promise<void> {
    await this.getClient().send(
      new DeleteObjectCommand({ Bucket: envConfig.spaces.bucket, Key: key }),
    );
    this.logger.log(`Objeto borrado de Spaces: ${key}`);
  }
}
