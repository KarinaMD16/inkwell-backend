import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/** Acciones de administración sobre las cuentas de Supabase Auth. Detrás de una interfaz para poder cambiarla en pruebas. */
export interface AccountAdmin {
  /** Borra la cuenta (correo, contraseña, sesiones). Si ya no existía, no hace nada. */
  deleteUser(id: string): Promise<void>;
}
export const ACCOUNT_ADMIN = Symbol('ACCOUNT_ADMIN');

@Injectable()
export class SupabaseAccountAdmin implements AccountAdmin {
  private readonly base: string;
  private readonly key: string | undefined;

  constructor(@Inject(ENV) env: Env) {
    this.base = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users`;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  async deleteUser(id: string): Promise<void> {
    if (!this.key) throw new ServiceUnavailableException('Eliminar cuentas todavía no está configurado en el servidor.');
    const res = await fetch(`${this.base}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase Auth respondió ${res.status} al borrar una cuenta`);
  }
}
