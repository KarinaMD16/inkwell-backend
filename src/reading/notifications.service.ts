import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { DB, type Db } from '../db/db.module.js';
import { chapters, comments, follows, library, notificationPrefs, profiles, stories } from '../db/schema.js';
import { isLive, visibleTo, type Viewer } from '../visibility/visibility.js';

/** Los interruptores de Ajustes. Campos de más se rechazan (regla 7). */
export const notificationPrefsSchema = z.strictObject({ chapters: z.boolean(), replies: z.boolean(), followers: z.boolean() });
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
const DEFAULTS: NotificationPrefs = { chapters: true, replies: true, followers: false };

/** Hasta qué tan atrás se miran los avisos, y cuántos se muestran. */
const WINDOW_DAYS = 60;
const LIMIT = 40;

type Actor = { handle: string; name: string; avatarUrl: string | null };
export type Notice =
  | { kind: 'capitulo'; at: Date; actor: Actor; story: { slug: string; title: string }; chapter: { n: number; title: string } }
  | { kind: 'respuesta' | 'comentario'; at: Date; actor: Actor; story: { slug: string; title: string }; chapter: { n: number; title: string }; comment: { id: string; block: string | null; excerpt: string } }
  | { kind: 'seguidor'; at: Date; actor: Actor };

const actorCols = { handle: profiles.handle, name: profiles.name, avatarUrl: profiles.avatarUrl };
const excerpt = (text: string) => (text.length > 140 ? `${text.slice(0, 140).trimEnd()}…` : text);

/**
 * Novedades. Los avisos no se guardan uno por uno: se arman al pedirlos con lo que ya existe.
 * Así un capítulo programado aparece solo cuando llega su hora, un comentario borrado o un "dejar de
 * seguir" se van solos del aviso, y publicar no tiene que escribir un aviso por cada seguidor.
 * - capítulo nuevo: de historias de tu repisa o de autores que sigues (no las tuyas);
 * - respuesta: alguien respondió a un comentario tuyo;
 * - comentario: alguien comentó un capítulo de tu historia;
 * - seguidor: alguien empezó a seguirte.
 * Cada tipo se puede apagar en Ajustes; la API lo respeta (no solo la pantalla).
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async prefs(userId: string): Promise<NotificationPrefs & { readAt: Date | null }> {
    const [row] = await this.db.select({
      chapters: notificationPrefs.chapters, replies: notificationPrefs.replies, followers: notificationPrefs.followers, readAt: notificationPrefs.readAt,
    }).from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
    return row ?? { ...DEFAULTS, readAt: null };
  }

  /** Guardar dos veces lo mismo deja lo mismo (idempotente). */
  async savePrefs(userId: string, prefs: NotificationPrefs) {
    const values = { ...prefs, updatedAt: new Date() };
    await this.db.insert(notificationPrefs).values({ userId, ...values }).onConflictDoUpdate({ target: notificationPrefs.userId, set: values });
    return prefs;
  }

  /** "Marcar todo como leído": todo lo de hasta ahora deja de contar como nuevo. */
  async markRead(userId: string) {
    const now = new Date();
    await this.db.insert(notificationPrefs).values({ userId, readAt: now })
      .onConflictDoUpdate({ target: notificationPrefs.userId, set: { readAt: now } });
    return { readAt: now };
  }

  async unread(viewer: Viewer) {
    const { items } = await this.feed(viewer);
    return { unread: items.filter((i) => i.unread).length };
  }

  /** Los avisos, del más nuevo al más viejo, cada uno marcado como leído o no. */
  async feed(viewer: Viewer) {
    const prefs = await this.prefs(viewer.id);
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    const lists = await Promise.all([
      prefs.chapters ? this.newChapters(viewer, since) : [],
      prefs.replies ? this.replies(viewer, since) : [],
      prefs.replies ? this.commentsOnMine(viewer, since) : [],
      prefs.followers ? this.newFollowers(viewer, since) : [],
    ]);
    const items = (lists.flat() as Notice[])
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, LIMIT)
      .map((n) => ({ ...n, unread: !prefs.readAt || n.at > prefs.readAt }));
    return { items, prefs: { chapters: prefs.chapters, replies: prefs.replies, followers: prefs.followers } };
  }

  /**
   * El número de capítulo como lo ve quien lee: su lugar entre los ya publicados (el lector
   * cuenta así, sin huecos por los borradores). Va en sql`` con las columnas de `chapters` ya
   * calificadas porque las consultas que lo usan juntan varias tablas.
   */
  private liveNumber(): SQL<number> {
    return sql<number>`(select count(*) from ${chapters} as c2 where c2.story_id = ${chapters.storyId} and c2.n <= ${chapters.n} and c2.published_at is not null and c2.published_at <= now())`.mapWith(Number);
  }

  private async newChapters(viewer: Viewer, since: Date): Promise<Notice[]> {
    const inShelf = this.db.select({ id: library.storyId }).from(library).where(eq(library.userId, viewer.id));
    const followed = this.db.select({ id: follows.followedId }).from(follows).where(eq(follows.followerId, viewer.id));
    const rows = await this.db
      .select({ at: chapters.publishedAt, n: this.liveNumber(), chapterTitle: chapters.title, slug: stories.slug, title: stories.title, actor: actorCols })
      .from(chapters)
      .innerJoin(stories, eq(stories.id, chapters.storyId))
      .innerJoin(profiles, eq(profiles.id, stories.authorId))
      .where(and(
        isLive, gt(chapters.publishedAt, since), ne(stories.authorId, viewer.id), visibleTo(this.db, viewer),
        or(inArray(stories.id, inShelf), inArray(stories.authorId, followed)),
      ))
      .orderBy(desc(chapters.publishedAt)).limit(LIMIT);
    return rows.map((r) => ({
      kind: 'capitulo', at: r.at!, actor: r.actor, story: { slug: r.slug, title: r.title }, chapter: { n: r.n, title: r.chapterTitle },
    }));
  }

  /** Respuestas de otras personas a tus comentarios. */
  private async replies(viewer: Viewer, since: Date): Promise<Notice[]> {
    const parent = alias(comments, 'parent');
    const rows = await this.db
      .select({
        at: comments.createdAt, id: comments.id, block: comments.blockId, body: comments.body,
        n: this.liveNumber(), chapterTitle: chapters.title, slug: stories.slug, title: stories.title, actor: actorCols,
      })
      .from(comments)
      .innerJoin(parent, eq(parent.id, comments.parentId))
      .innerJoin(chapters, eq(chapters.id, comments.chapterId))
      .innerJoin(stories, eq(stories.id, chapters.storyId))
      .innerJoin(profiles, eq(profiles.id, comments.authorId))
      .where(and(
        eq(parent.authorId, viewer.id), ne(comments.authorId, viewer.id), isNull(comments.deletedAt),
        gt(comments.createdAt, since), isLive, visibleTo(this.db, viewer),
      ))
      .orderBy(desc(comments.createdAt)).limit(LIMIT);
    return rows.map((r) => ({
      kind: 'respuesta', at: r.at, actor: r.actor, story: { slug: r.slug, title: r.title },
      chapter: { n: r.n, title: r.chapterTitle }, comment: { id: r.id, block: r.block, excerpt: excerpt(r.body) },
    }));
  }

  /** Comentarios nuevos (no respuestas) de otras personas en tus historias. */
  private async commentsOnMine(viewer: Viewer, since: Date): Promise<Notice[]> {
    const rows = await this.db
      .select({
        at: comments.createdAt, id: comments.id, block: comments.blockId, body: comments.body,
        n: this.liveNumber(), chapterTitle: chapters.title, slug: stories.slug, title: stories.title, actor: actorCols,
      })
      .from(comments)
      .innerJoin(chapters, eq(chapters.id, comments.chapterId))
      .innerJoin(stories, eq(stories.id, chapters.storyId))
      .innerJoin(profiles, eq(profiles.id, comments.authorId))
      .where(and(
        eq(stories.authorId, viewer.id), ne(comments.authorId, viewer.id), isNull(comments.parentId),
        isNull(comments.deletedAt), gt(comments.createdAt, since), isLive,
      ))
      .orderBy(desc(comments.createdAt)).limit(LIMIT);
    return rows.map((r) => ({
      kind: 'comentario', at: r.at, actor: r.actor, story: { slug: r.slug, title: r.title },
      chapter: { n: r.n, title: r.chapterTitle }, comment: { id: r.id, block: r.block, excerpt: excerpt(r.body) },
    }));
  }

  private async newFollowers(viewer: Viewer, since: Date): Promise<Notice[]> {
    const rows = await this.db
      .select({ at: follows.createdAt, actor: actorCols })
      .from(follows)
      .innerJoin(profiles, eq(profiles.id, follows.followerId))
      .where(and(eq(follows.followedId, viewer.id), gt(follows.createdAt, since), isNull(profiles.suspendedAt)))
      .orderBy(desc(follows.createdAt)).limit(LIMIT);
    return rows.map((r) => ({ kind: 'seguidor', at: r.at, actor: r.actor }));
  }
}
