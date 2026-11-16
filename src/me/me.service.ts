import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { AuthUser } from '../auth/auth.service.js';
import { slugify } from '../common/slug.js';
import { DB, type Db } from '../db/db.module.js';
import { profiles } from '../db/schema.js';
import { processImage, type ImageKind } from '../storage/images.js';
import { STORAGE, type FileStorage } from '../storage/storage.js';
import type { ProfilePatch } from './profile.schemas.js';

type ProfileRow = typeof profiles.$inferSelect;
const COLUMN = { avatar: 'avatarUrl', banner: 'bannerUrl' } as const;

@Injectable()
export class MeService {
  private readonly log = new Logger(MeService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Lo que ve la propia persona: su perfil completo más el correo de su cuenta (sale del token). */
  view(row: ProfileRow, user: AuthUser) {
    return { ...row, email: user.email };
  }

  /**
   * Devuelve el perfil de la persona y lo crea la primera vez que entra.
   * Así no hace falta ningún trigger en Supabase: el perfil nace en la API.
   */
  async getOrCreate(user: AuthUser): Promise<ProfileRow> {
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

  async update(user: AuthUser, patch: ProfilePatch): Promise<ProfileRow> {
    await this.getOrCreate(user);
    if (patch.handle) {
      const [taken] = await this.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.handle, patch.handle));
      if (taken && taken.id !== user.id) throw new ConflictException('Ese nombre de usuario ya está en uso');
    }
    const [updated] = await this.db
      .update(profiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(profiles.id, user.id))
      .returning();
    return updated;
  }

  /** Sube una foto de perfil o portada nueva y borra la anterior. */
  async setImage(user: AuthUser, kind: ImageKind, file: Buffer): Promise<ProfileRow> {
    const before = await this.getOrCreate(user);
    const webp = await processImage(file, kind);
    // Nombre nuevo en cada subida: nadie ve una versión vieja guardada en caché.
    const key = `${kind}s/${user.id}/${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.webp`;
    const url = await this.storage.put(key, webp, 'image/webp');
    const [updated] = await this.db
      .update(profiles)
      .set({ [COLUMN[kind]]: url, updatedAt: new Date() })
      .where(eq(profiles.id, user.id))
      .returning();
    await this.forget(before[COLUMN[kind]]);
    return updated;
  }

  async removeImage(user: AuthUser, kind: ImageKind): Promise<ProfileRow> {
    const before = await this.getOrCreate(user);
    const [updated] = await this.db
      .update(profiles)
      .set({ [COLUMN[kind]]: null, updatedAt: new Date() })
      .where(eq(profiles.id, user.id))
      .returning();
    await this.forget(before[COLUMN[kind]]);
    return updated;
  }

  /** Borrar la imagen vieja es limpieza: si falla, el perfil ya quedó bien y solo se avisa en el log. */
  private async forget(url: string | null) {
    if (!url) return;
    try {
      await this.storage.removeByUrl(url);
    } catch (err) {
      this.log.warn(`No se pudo borrar ${url}: ${(err as Error).message}`);
    }
  }
}
