import { Injectable, Logger } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { envConfig } from '../../config/env.config';

/**
 * DigitalOcean Spaces (S3-compatible). Hoy guarda las imágenes de comprobantes
 * de transferencia que llegan por WhatsApp sin reserva pendiente, para que el
 * equipo las revise después.
 *
 * Los objetos se suben PRIVADOS (contienen PII bancaria): el admin los ve vía
 * URL firmada de corta vida (signedUrl), nunca por URL pública.
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
}
