import { ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ACCOUNT_ADMIN, type AccountAdmin } from '../auth/auth-admin.js';
import { randomBytes, randomInt } from 'node:crypto';
import type { AuthUser } from '../auth/auth.service.js';
import { isUniqueViolation } from '../common/db-errors.js';
import { DB, type Db } from '../db/db.module.js';
import { profiles, stories } from '../db/schema.js';
import { recount, tagIdsOf } from '../stories/tagging.js';
import { processImage, type ImageKind } from '../storage/images.js';
import { STORAGE, type FileStorage } from '../storage/storage.js';
import { birthdateSchema, handleSchema, type ProfilePatch } from './profile.schemas.js';

type ProfileRow = typeof profiles.$inferSelect;
const COLUMN = { avatar: 'avatarUrl', banner: 'bannerUrl' } as const;
/** Para acciones irreversibles: haberse identificado en los últimos 10 minutos. */
const RECENT_AUTH_SECONDS = 10 * 60;

@Injectable()
export class MeService {
  private readonly log = new Logger(MeService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: FileStorage,
    @Inject(ACCOUNT_ADMIN) private readonly accounts: AccountAdmin,
  ) {}

  /** Lo que ve la propia persona: su perfil completo más el correo de su cuenta (sale del token). */
  view(row: ProfileRow, user: AuthUser) {
    return { ...row, email: user.email };
  }

  /**
   * Devuelve el perfil de la persona y lo crea la primera vez que entra.
   * Así no hace falta ningún trigger en Supabase: el perfil nace en la API.
   *
   * Si se registró con correo, el nombre de usuario y la fecha de nacimiento que escribió vienen en
   * su sesión y se validan aquí, igual que en cualquier edición. Si el nombre está ocupado o no es
   * válido, se le da uno provisional (nunca sacado de su correo, que es privado) y lo cambia después.
   * Es idempotente: dos peticiones a la vez terminan con el mismo perfil.
   */
  async getOrCreate(user: AuthUser): Promise<ProfileRow> {
    const [found] = await this.db.select().from(profiles).where(eq(profiles.id, user.id));
    if (found) return found;

    const wanted = handleSchema.safeParse(user.signup.handle);
    const birth = birthdateSchema.safeParse(user.signup.birthdate);
    const birthdate = birth.success ? birth.data : null;
    for (let i = 0; i < 6; i++) {
      const handle = i === 0 && wanted.success ? wanted.data : `lector.${randomInt(100_000, 1_000_000)}`;
      // Sin `target`: ignora el choque tanto por id (otra petición lo creó) como por nombre ocupado.
      const [created] = await this.db
        .insert(profiles)
        .values({ id: user.id, handle, name: handle, birthdate })
        .onConflictDoNothing()
        .returning();
      if (created) return created;
      const [again] = await this.db.select().from(profiles).where(eq(profiles.id, user.id));
      if (again) return again;
    }
    throw new ConflictException('No pudimos crear tu perfil. Intenta de nuevo en un momento.');
  }

  async update(user: AuthUser, patch: ProfilePatch): Promise<ProfileRow> {
    const current = await this.getOrCreate(user);
    // La fecha de nacimiento decide qué contenido se puede ver: se pone una vez y no se cambia,
    // para que nadie se la suba para saltarse la clasificación por edad.
    if (patch.birthdate !== undefined && current.birthdate && patch.birthdate !== current.birthdate) {
      throw new ConflictException({
        message: 'Datos inválidos',
        errors: [{ campo: 'birthdate', error: 'Tu fecha de nacimiento ya está registrada y no se puede cambiar.' }],
      });
    }
    try {
      const [updated] = await this.db
        .update(profiles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(profiles.id, user.id))
        .returning();
      return updated;
    } catch (err) {
      // El índice único decide, no una consulta previa: así dos personas no se llevan el mismo nombre.
      if (isUniqueViolation(err)) {
        throw new ConflictException({ message: 'Datos inválidos', errors: [{ campo: 'handle', error: 'Ese nombre de usuario ya está en uso' }] });
      }
      throw err;
    }
  }

  /**
   * Elimina la cuenta y todo lo suyo (regla 20): perfil, historias, capítulos, votos, repisa,
   * imágenes y la cuenta de Supabase. Es irreversible, así que pide haberse identificado hace poco
   * (contraseña o Google): una sesión olvidada abierta no alcanza para borrar la cuenta de alguien.
   */
  async deleteAccount(user: AuthUser): Promise<void> {
    if (Date.now() / 1000 - user.authTime > RECENT_AUTH_SECONDS) {
      throw new ForbiddenException({ message: 'Por seguridad, confirma que eres tú antes de eliminar tu cuenta.', code: 'reauth' });
    }
    const [profile] = await this.db.select().from(profiles).where(eq(profiles.id, user.id));
    const covers = profile ? await this.db.select({ id: stories.id, cover: stories.coverUrl }).from(stories).where(eq(stories.authorId, user.id)) : [];
    // Primero la cuenta: sin ella nadie puede volver a entrar. Si después fallara la base, el perfil
    // huérfano lo limpia `npm run db:limpiar-muestra` (busca perfiles sin cuenta).
    await this.accounts.deleteUser(user.id);
    if (profile) {
      await this.db.transaction(async (tx) => {
        const used = new Set<string>();
        for (const s of covers) for (const t of await tagIdsOf(tx, s.id)) used.add(t);
        await tx.delete(profiles).where(eq(profiles.id, user.id)); // en cascada: historias, capítulos, votos, repisa
        await recount(tx, [...used]);
      });
    }
    for (const url of [profile?.avatarUrl ?? null, profile?.bannerUrl ?? null, ...covers.map((s) => s.cover)]) await this.forget(url);
    this.log.log(`Cuenta eliminada: ${user.id}`);
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
