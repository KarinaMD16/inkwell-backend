import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException, Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomBytes, randomInt } from 'node:crypto';
import { AUTH_DIRECTORY, type AuthDirectory } from '../auth/auth-directory.js';
import { adminEmails } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { isUniqueViolation } from '../common/db-errors.js';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { profiles } from '../db/schema.js';
import { processImage, type ImageKind } from '../storage/images.js';
import { STORAGE, type FileStorage } from '../storage/storage.js';
import { AccountsService } from './accounts.service.js';
import { ADULT_AGE } from '../visibility/visibility.js';
import { ageFrom, birthdateSchema, handleSchema, type ProfilePatch } from './profile.schemas.js';

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
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(AUTH_DIRECTORY) private readonly directory: AuthDirectory,
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
    // Tras eliminar una cuenta, su token sigue firmado hasta que vence (1 h): sin esto, cualquier
    // petición con él volvería a crear un perfil vacío de alguien que ya no existe (regla 20).
    if (!(await this.directory.exists(user.id))) throw new UnauthorizedException('Esta cuenta ya no existe.');

    const wanted = handleSchema.safeParse(user.signup.handle);
    const birth = birthdateSchema.safeParse(user.signup.birthdate);
    const birthdate = birth.success ? birth.data : null;
    const role = user.email && adminEmails(this.env).has(user.email.toLowerCase()) ? 'admin' : 'lector';
    for (let i = 0; i < 6; i++) {
      const handle = i === 0 && wanted.success ? wanted.data : `lector.${randomInt(100_000, 1_000_000)}`;
      // Sin `target`: ignora el choque tanto por id (otra petición lo creó) como por nombre ocupado.
      const [created] = await this.db
        .insert(profiles)
        .values({ id: user.id, handle, name: handle, birthdate, role })
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
    // +18 solo con la mayoría de edad ya registrada: el servidor lo decide, no el interruptor (regla 17).
    const birthdate = patch.birthdate ?? current.birthdate;
    if (patch.showMature && (!birthdate || (ageFrom(birthdate) ?? 0) < ADULT_AGE)) {
      throw new BadRequestException({
        message: 'Datos inválidos',
        errors: [{ campo: 'showMature', error: 'Las historias +18 son solo para cuentas de mayores de edad.' }],
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
   * Elimina la propia cuenta y todo lo suyo (regla 20). Es irreversible, así que pide haberse
   * identificado hace poco (contraseña o Google): una sesión olvidada abierta no alcanza para
   * borrar la cuenta de alguien.
   */
  async deleteAccount(user: AuthUser): Promise<void> {
    if (Date.now() / 1000 - user.authTime > RECENT_AUTH_SECONDS) {
      throw new ForbiddenException({ message: 'Por seguridad, confirma que eres tú antes de eliminar tu cuenta.', code: 'reauth' });
    }
    await this.accounts.delete(user.id);
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
