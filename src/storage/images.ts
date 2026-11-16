import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/** Medidas finales de cada tipo de imagen. Se recorta al centro para llenar el formato. */
export const IMAGE_KINDS = {
  avatar: { width: 400, height: 400, quality: 82 },
  banner: { width: 1500, height: 500, quality: 80 },
  /** Portada de una historia, 2:3 como la tapa del libro. */
  cover: { width: 800, height: 1200, quality: 82 },
} as const;
/** Las dos imágenes de un perfil. */
export type ImageKind = 'avatar' | 'banner';

/** Tamaño máximo del archivo que se acepta (antes de comprimir). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);

/**
 * Valida y normaliza una imagen subida:
 * - se fija en el contenido real del archivo, no en su extensión ni en el tipo que dice el navegador;
 * - la endereza según la orientación de la cámara y la recorta a la medida;
 * - la guarda en WebP sin metadatos: las fotos de celular traen la ubicación GPS en el EXIF
 *   y no debe quedar pública.
 */
export async function processImage(input: Buffer, kind: keyof typeof IMAGE_KINDS): Promise<Buffer> {
  const size = IMAGE_KINDS[kind];
  let format: string | undefined;
  try {
    ({ format } = await sharp(input, { limitInputPixels: 50_000_000 }).metadata());
  } catch {
    throw new BadRequestException('Ese archivo no es una imagen válida');
  }
  if (!format || !ACCEPTED.has(format)) throw new BadRequestException('Usa una imagen JPG, PNG, WebP, GIF o AVIF');
  try {
    return await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(size.width, size.height, { fit: 'cover', position: 'attention' })
      .webp({ quality: size.quality })
      .toBuffer();
  } catch {
    throw new BadRequestException('No pudimos procesar esa imagen. Prueba con otra.');
  }
}
