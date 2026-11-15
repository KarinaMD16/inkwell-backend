import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valida el cuerpo o la consulta con un esquema de zod y devuelve el valor ya tipado. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Datos inválidos',
        errors: parsed.error.issues.map((i) => ({ campo: i.path.join('.'), error: i.message })),
      });
    }
    return parsed.data;
  }
}
