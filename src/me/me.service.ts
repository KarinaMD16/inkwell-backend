import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.service.js';
import { slugify } from '../common/slug.js';
import { DB, type Db } from '../db/db.module.js';
import { profiles } from '../db/schema.js';

@Injectable()
export class MeService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Devuelve el perfil de la persona y lo crea la primera vez que entra.
   * Así no hace falta ningún trigger en Supabase: el perfil nace en la API.
   */
  async getOrCreate(user: AuthUser) {
    const [found] = await this.db.select().from(profiles).where(eq(profiles.id, user.id));
    if (found) return found;

    const base = slugify(user.email?.split('@')[0] ?? 'lector').replace(/-/g, '.') || 'lector';
    for (let i = 0; i < 5; i++) {
      const handle = i === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      const [created] = await this.db
        .insert(profiles)
        .values({ id: user.id, handle, name: base })
        .onConflictDoNothing()
        .returning();
      if (created) return created;
      // Otra petición pudo crear el perfil al mismo tiempo.
      const [again] = await this.db.select().from(profiles).where(eq(profiles.id, user.id));
      if (again) return again;
    }
    throw new ConflictException('No se pudo crear el perfil; intenta de nuevo');
  }

  async update(user: AuthUser, patch: { handle?: string; name?: string; bio?: string }) {
    await this.getOrCreate(user);
    if (patch.handle) {
      const [taken] = await this.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.handle, patch.handle));
      if (taken && taken.id !== user.id) throw new ConflictException('Ese nombre de usuario ya está en uso');
    }
    const [updated] = await this.db.update(profiles).set(patch).where(eq(profiles.id, user.id)).returning();
    return updated;
  }
}
