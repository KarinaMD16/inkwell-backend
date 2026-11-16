import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import type { Tx } from '../stories/tagging.js';

export interface AccountInfo {
  email: string | null;
  lastSignInAt: Date | null;
}

/**
 * Lo que la API necesita de las cuentas de Supabase Auth (tabla auth.users), que no es nuestra:
 * el correo y el último acceso para el panel de administración, y borrar la cuenta.
 * Las pruebas lo reemplazan por uno en memoria, porque su Postgres no tiene el esquema auth.
 */
export interface AuthDirectory {
  lookup(ids: string[]): Promise<Map<string, AccountInfo>>;
  /** Ids de las cuentas cuyo correo contiene el texto. */
  findByEmail(text: string): Promise<string[]>;
  /** Borra la cuenta dentro de la transacción en curso: si algo falla después, no se borra nada. */
  deleteAccount(tx: Tx, id: string): Promise<void>;
}
export const AUTH_DIRECTORY = Symbol('AUTH_DIRECTORY');

type Row = Record<string, unknown>;
/** postgres-js devuelve un arreglo; otros drivers, un objeto con `rows`. */
const rowsOf = (result: unknown): Row[] => (Array.isArray(result) ? result : ((result as { rows?: Row[] }).rows ?? []));

/**
 * Lee y borra en auth.users directo desde Postgres: el rol con el que se conecta la API puede
 * hacerlo, así no hace falta guardar la llave secreta de Supabase en el servidor.
 */
@Injectable()
export class SqlAuthDirectory implements AuthDirectory {
  constructor(@Inject(DB) private readonly db: Db) {}

  async lookup(ids: string[]): Promise<Map<string, AccountInfo>> {
    const found = new Map<string, AccountInfo>();
    if (!ids.length) return found;
    const list = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
    const result = await this.db.execute(sql`select id, email, last_sign_in_at from auth.users where id in (${list})`);
    for (const r of rowsOf(result)) {
      found.set(String(r.id), {
        email: (r.email as string | null) ?? null,
        lastSignInAt: r.last_sign_in_at ? new Date(r.last_sign_in_at as string) : null,
      });
    }
    return found;
  }

  async findByEmail(text: string): Promise<string[]> {
    const like = `%${text.replace(/[%_\\]/g, '\\$&')}%`;
    const result = await this.db.execute(sql`select id from auth.users where email ilike ${like} limit 50`);
    return rowsOf(result).map((r) => String(r.id));
  }

  async deleteAccount(tx: Tx, id: string): Promise<void> {
    // Se borran también sus sesiones e identidades (Google): auth.users las tiene en cascada.
    await (tx as Db).execute(sql`delete from auth.users where id = ${id}::uuid`);
  }
}
