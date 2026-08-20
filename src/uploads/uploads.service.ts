import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as path from 'path';
import * as sharp from 'sharp';
import { SpacesService } from '../common/services/spaces.service';

const ALLOWED_MIMETYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// Carpetas permitidas dentro del bucket (evita keys arbitrarias).
const ALLOWED_FOLDERS = new Set(['piezas', 'experiencias', 'general']);

export interface UploadedImage {
  key: string;
  url: string;
  size: number;
}

/**
 * Carga de imágenes del sistema a DigitalOcean Spaces (mismo Space que los
 * comprobantes; estas van PÚBLICAS). Toda imagen se convierte a WebP q85 —
 * pesa ~60-80% menos que el original — y el nombre lleva timestamp para no
 * pisar archivos y poder cachear un año. Sin portada ni asociación acá: la
 * URL devuelta se guarda donde corresponda (photos[] de la pieza, images[]
 * de la experiencia).
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private readonly spaces: SpacesService) {}

  async uploadImage(
    file: Express.Multer.File | undefined,
    folder?: string,
  ): Promise<UploadedImage> {
    if (!this.spaces.enabled) {
      throw new ServiceUnavailableException(
        'La carga de imágenes no está configurada (DO_SPACES_*).',
      );
    }
    if (!file) throw new BadRequestException('No llegó ningún archivo.');
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Formato inválido: se aceptan JPEG, PNG, GIF o WebP.',
      );
    }

    const dir = ALLOWED_FOLDERS.has(folder ?? '') ? folder : 'general';
    const base = path
      .parse(file.originalname || 'imagen')
      .name.normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase()
      .slice(0, 60);
    const key = `images/${dir}/${Date.now()}-${base || 'imagen'}.webp`;

    let webp: Buffer;
    try {
      // rotate() respeta la orientación EXIF (fotos de celular).
      webp = await sharp(file.buffer)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 85, effort: 6 })
        .toBuffer();
    } catch (e) {
      this.logger.warn(`sharp no pudo procesar ${file.originalname}: ${e}`);
      throw new BadRequestException(
        'No se pudo procesar la imagen: ¿el archivo está dañado?',
      );
    }

    const url = await this.spaces.uploadPublic(key, webp, 'image/webp');
    this.logger.log(
      `Imagen ${file.originalname} (${file.size}b) -> ${key} (${webp.length}b)`,
    );
    return { key, url, size: webp.length };
  }

  async deleteImage(key: string): Promise<{ success: boolean }> {
    if (!this.spaces.enabled) {
      throw new ServiceUnavailableException(
        'La carga de imágenes no está configurada (DO_SPACES_*).',
      );
    }
    // Sólo se borran objetos del árbol de imágenes públicas: los comprobantes
    // privados no se tocan desde acá.
    if (!key.startsWith('images/')) {
      throw new BadRequestException('Sólo se pueden borrar imágenes (images/…).');
    }
    await this.spaces.deleteObject(key);
    return { success: true };
  }
}
