import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from '../db/db.module.js';
import { READER_SIZE, READER_SPACINGS, READER_THEMES, readingPrefs } from '../db/schema.js';

/** Lo que manda el lector. Campos de más se rechazan (regla 7). */
export const readingPrefsSchema = z.strictObject({
  size: z.number().int().min(READER_SIZE.min, `El tamaño va de ${READER_SIZE.min} a ${READER_SIZE.max}`).max(READER_SIZE.max, `El tamaño va de ${READER_SIZE.min} a ${READER_SIZE.max}`),
  serif: z.boolean(),
  spacing: z.enum(READER_SPACINGS, { message: 'El interlineado debe ser justo, normal o amplio' }),
  theme: z.enum(READER_THEMES, { message: 'El tema debe ser claro, sepia u oscuro' }),
});
export type ReadingPrefs = z.infer<typeof readingPrefsSchema>;

const columns = { size: readingPrefs.size, serif: readingPrefs.serif, spacing: readingPrefs.spacing, theme: readingPrefs.theme };

/** Las preferencias del lector de cada cuenta (tamaño, letra, interlineado y tema). */
@Injectable()
export class ReadingPrefsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** null si la persona nunca guardó nada: el lector usa sus valores por defecto. */
  async get(userId: string): Promise<ReadingPrefs | null> {
    const [row] = await this.db.select(columns).from(readingPrefs).where(eq(readingPrefs.userId, userId));
    return row ?? null;
  }

  /** Guarda todas las preferencias de una vez: repetir la misma petición deja lo mismo (idempotente). */
  async save(userId: string, prefs: ReadingPrefs): Promise<ReadingPrefs> {
    const values = { ...prefs, updatedAt: new Date() };
    await this.db.insert(readingPrefs).values({ userId, ...values })
      .onConflictDoUpdate({ target: readingPrefs.userId, set: values });
    return prefs;
  }
}
