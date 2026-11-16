import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { AUTH_DIRECTORY, type AuthDirectory } from '../auth/auth-directory.js';
import type { AuthUser } from '../auth/auth.service.js';
import { DB, type Db } from '../db/db.module.js';
import { chapters, library, profiles, stories, votes } from '../db/schema.js';
import { recount, tagIdsOfAuthor } from '../stories/tagging.js';
import { STORAGE, type FileStorage } from '../storage/storage.js';

/**
 * Lo que toca la cuenta entera: borrarla con todo lo suyo y entregarle una copia de sus datos.
 * Lo usan la propia persona (/me) y administración (/admin).
 */
@Injectable()
export class AccountsService {
  private readonly log = new Logger(AccountsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: FileStorage,
    @Inject(AUTH_DIRECTORY) private readonly directory: AuthDirectory,
  ) {}

  /**
   * Borra la cuenta para siempre: perfil, historias con sus capítulos, repisa, votos, imágenes y la
   * cuenta de Supabase Auth (con sus sesiones y su acceso con Google). Lo de la base va en una sola
   * transacción: o se borra todo o nada.
   */
  async delete(id: string): Promise<void> {
    const [profile] = await this.db.select().from(profiles).where(eq(profiles.id, id));
    const covers = (await this.db.select({ url: stories.coverUrl }).from(stories).where(eq(stories.authorId, id))).map((r) => r.url);
    await this.db.transaction(async (tx) => {
      const used = await tagIdsOfAuthor(tx, id);
      // Historias, capítulos, votos, repisa y etiquetas de sus historias se van en cascada.
      if (profile) await tx.delete(profiles).where(eq(profiles.id, id));
      await recount(tx, used);
      await this.directory.deleteAccount(tx, id);
    });
    // Las imágenes se borran al final: si falla, la cuenta ya no existe y solo queda aviso en el log.
    for (const url of [profile?.avatarUrl, profile?.bannerUrl, ...covers]) {
      if (!url) continue;
      try {
        await this.storage.removeByUrl(url);
      } catch (err) {
        this.log.warn(`No se pudo borrar ${url}: ${(err as Error).message}`);
      }
    }
  }

  /** Una copia de todo lo que Inkwell guarda de la persona, para descargar. */
  async export(user: AuthUser) {
    const [profile] = await this.db.select().from(profiles).where(eq(profiles.id, user.id));
    if (!profile) throw new NotFoundException('Todavía no tienes perfil');
    const own = await this.db.select().from(stories).where(eq(stories.authorId, user.id)).orderBy(asc(stories.createdAt));
    const chapterRows = own.length
      ? await this.db.select().from(chapters).where(inArray(chapters.storyId, own.map((s) => s.id))).orderBy(asc(chapters.n))
      : [];
    const shelf = await this.db
      .select({ historia: stories.slug, titulo: stories.title, capitulo: library.chapter, actualizado: library.updatedAt })
      .from(library).innerJoin(stories, eq(stories.id, library.storyId))
      .where(eq(library.userId, user.id));
    const voted = await this.db
      .select({ historia: stories.slug, capitulo: chapters.title, fecha: votes.createdAt })
      .from(votes).innerJoin(chapters, eq(chapters.id, votes.chapterId)).innerJoin(stories, eq(stories.id, chapters.storyId))
      .where(eq(votes.userId, user.id));

    return {
      exportado: new Date().toISOString(),
      cuenta: { id: user.id, correo: user.email },
      perfil: {
        usuario: profile.handle, nombre: profile.name, presentacion: profile.bio, enlace: profile.link,
        foto: profile.avatarUrl, portada: profile.bannerUrl, nacimiento: profile.birthdate, rol: profile.role,
        creado: profile.createdAt,
      },
      historias: own.map((s) => ({
        slug: s.slug, titulo: s.title, frase: s.tagline, sinopsis: s.synopsis, portada: s.coverUrl, tipo: s.kind,
        genero: s.genre, subgeneros: s.subgenres, fandom: s.fandom, relacion: s.relation, personajes: s.characters,
        tropos: s.tropes, advertencias: s.warnings, etiquetas: s.freeTags, clasificacion: s.rating, estado: s.status,
        formato: s.format, licencia: s.license, idioma: s.language, publicada: s.published, lecturas: s.reads,
        creada: s.createdAt, actualizada: s.updatedAt,
        capitulos: chapterRows.filter((c) => c.storyId === s.id).map((c) => ({
          orden: c.n, titulo: c.title, etiqueta: c.badge, palabras: c.words, publicado: c.publishedAt,
          contenido: c.content, creado: c.createdAt, actualizado: c.updatedAt,
        })),
      })),
      repisa: shelf,
      votos: voted,
    };
  }
}
