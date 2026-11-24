import { ArgumentsHost, Catch, ConflictException, HttpException, InternalServerErrorException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { isUniqueViolation } from './db-errors.js';

/**
 * Último filtro de errores (regla 9): la persona nunca ve un error de la base ni un stack trace.
 * - Los errores que la API lanza a propósito (HttpException) salen tal cual: ya traen su mensaje.
 * - Un choque con un índice único es un 409 entendible.
 * - Cualquier otro se registra (sin cuerpo ni datos de la persona) y responde un 500 genérico.
 */
@Catch()
export class ErrorsFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Errores');

  override catch(err: unknown, host: ArgumentsHost) {
    if (err instanceof HttpException) return super.catch(err, host);
    if (isUniqueViolation(err)) return super.catch(new ConflictException('Eso ya existe. Revisa los datos e intenta de nuevo.'), host);
    const req = host.switchToHttp().getRequest<Request>();
    this.log.error(`${req.method} ${req.path}: ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : undefined);
    return super.catch(new InternalServerErrorException('Algo falló de nuestro lado. Intenta de nuevo en un momento.'), host);
  }
}
