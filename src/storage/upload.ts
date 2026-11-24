import {
  BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { catchError, type Observable } from 'rxjs';
import { MAX_UPLOAD_BYTES } from './images.js';

/** Lo único que usamos del archivo que entrega multer. */
export interface UploadedImage { buffer: Buffer }

/** El mensaje de "archivo muy grande" de multer viene en inglés: lo traducimos. */
@Injectable()
class UploadErrors implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof PayloadTooLargeException) {
          throw new PayloadTooLargeException(`La imagen pesa demasiado: el máximo es ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
        }
        throw err;
      }),
    );
  }
}
/** Para rutas que reciben una imagen en multipart/form-data, campo "file". */
export const upload = () => UseInterceptors(UploadErrors, FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }));

export function need(file: UploadedImage | undefined): Buffer {
  if (!file?.buffer?.length) throw new BadRequestException('Falta la imagen (campo "file")');
  return file.buffer;
}
