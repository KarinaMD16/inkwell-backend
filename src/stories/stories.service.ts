import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, isNotNull, lte, or, sql } from 'drizzle-orm';
import { slugify } from '../common/slug.js';
import { DB, type Db } from '../db/db.module.js';
import { chapters, profiles, stories, votes } from '../db/schema.js';
import type { CreateChapter, CreateStory, ListQuery } from './stories.schemas.js';

/** Un capítulo es visible si tiene fecha de publicación y esa fecha ya pasó. */
const isLive = and(isNotNull(chapters.publishedAt), lte(chapters.publishedAt, sql`now()`));

@Injectable()
export class StoriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Columnas públicas de una historia, con autor, capítulos publicados y votos. */
  private counts() {
    const chapterCount = this.db.select({ c: count() }).from(chapters).where(and(eq(chapters.storyId, stories.id), isLive));
    const voteCount = this.db
      .select({ c: count() })
      .from(votes)
      .innerJoin(chapters, eq(votes.chapterId, chapters.id))
      .where(eq(chapters.storyId, stories.id));
    return {
      chapters: sql<number>`(${chapterCount})`.mapWith(Number),
      votes: sql<number>`(${voteCount})`.mapWith(Number),
    };
  }

  private columns() {
    const totals = this.counts();
    return {
      slug: stories.slug, title: stories.title, author: profiles.handle, tagline: stories.tagline, synopsis: stories.synopsis,
      cover: stories.coverUrl, color: stories.color, ink: stories.ink, art: stories.art, genre: stories.genre, fandom: stories.fandom,
      relation: stories.relation, tropes: stories.tropes, warnings: stories.warnings, rating: stories.rating, status: stories.status,
      format: stories.format, reads: stories.reads, updatedAt: stories.updatedAt,
      chapters: totals.chapters,
      votes: totals.votes,
    };
  }

  private select() {
    return this.db.select(this.columns()).from(stories).innerJoin(profiles, eq(stories.authorId, profiles.id));
  }

  /** Las historias de quien pregunta, publicadas o no, con el total de capítulos contando borradores. */
  listMine(authorId: string) {
    const allChapters = this.db.select({ c: count() }).from(chapters).where(eq(chapters.storyId, stories.id));
    return this.db
      .select({ ...this.columns(), published: stories.published, totalChapters: sql<number>`(${allChapters})`.mapWith(Number) })
      .from(stories)
      .innerJoin(profiles, eq(stories.authorId, profiles.id))
      .where(eq(stories.authorId, authorId))
      .orderBy(desc(stories.updatedAt));
  }

  async list(query: ListQuery) {
    const like = query.q ? `%${query.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    const where = and(
      eq(stories.published, true),
      query.genre ? eq(stories.genre, query.genre) : undefined,
      query.status ? eq(stories.status, query.status) : undefined,
      query.author ? eq(profiles.handle, query.author) : undefined,
      like ? or(ilike(stories.title, like), ilike(profiles.handle, like), ilike(stories.genre, like)) : undefined,
    );
    const order = { votos: desc(this.counts().votes), recientes: desc(stories.updatedAt), lecturas: desc(stories.reads) }[query.sort];
    const items = await this.select().where(where).orderBy(order, asc(stories.slug)).limit(query.limit).offset(query.offset);
    return { items, limit: query.limit, offset: query.offset };
  }

  async get(slug: string) {
    const [story] = await this.select().where(and(eq(stories.slug, slug), eq(stories.published, true)));
    if (!story) throw new NotFoundException('No encontramos esa historia');
    return story;
  }

  /** Fila interna, con dueño: para comprobar permisos antes de escribir. */
  private async row(slug: string) {
    const [row] = await this.db.select().from(stories).where(eq(stories.slug, slug));
    if (!row) throw new NotFoundException('No encontramos esa historia');
    return row;
  }

  async create(authorId: string, input: CreateStory) {
    const base = slugify(input.title) || 'historia';
    for (let i = 0; i < 6; i++) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const [created] = await this.db.insert(stories).values({ ...input, slug, authorId }).onConflictDoNothing().returning({ slug: stories.slug });
      if (created) return created;
    }
    throw new ConflictException('Ya existen varias historias con ese título; prueba con otro');
  }

  async listChapters(slug: string) {
    const story = await this.row(slug);
    return this.db
      .select({ n: chapters.n, title: chapters.title, badge: chapters.badge, publishedAt: chapters.publishedAt })
      .from(chapters)
      .where(and(eq(chapters.storyId, story.id), isLive))
      .orderBy(asc(chapters.n));
  }

  async getChapter(slug: string, n: number) {
    const story = await this.row(slug);
    const [chapter] = await this.db
      .select({ id: chapters.id, n: chapters.n, title: chapters.title, badge: chapters.badge, content: chapters.content, publishedAt: chapters.publishedAt })
      .from(chapters)
      .where(and(eq(chapters.storyId, story.id), eq(chapters.n, n), isLive));
    if (!chapter) throw new NotFoundException('No encontramos ese capítulo');
    // Contador simple de lecturas; más adelante conviene contarlas por persona.
    await this.db.update(stories).set({ reads: sql`${stories.reads} + 1` }).where(eq(stories.id, story.id));
    const [{ c }] = await this.db.select({ c: count() }).from(votes).where(eq(votes.chapterId, chapter.id));
    const { id: _id, ...rest } = chapter;
    return { ...rest, votes: c };
  }

  async addChapter(userId: string, slug: string, input: CreateChapter) {
    const story = await this.row(slug);
    if (story.authorId !== userId) throw new ForbiddenException('Solo quien escribe la historia puede agregar capítulos');
    const [{ last }] = await this.db.select({ last: sql<number>`coalesce(max(${chapters.n}), 0)`.mapWith(Number) }).from(chapters).where(eq(chapters.storyId, story.id));
    const [created] = await this.db
      .insert(chapters)
      .values({ storyId: story.id, n: last + 1, title: input.title, badge: input.badge, content: input.content, publishedAt: input.publish ? new Date() : null })
      .returning({ n: chapters.n, title: chapters.title, publishedAt: chapters.publishedAt });
    // Publicar un capítulo también saca la historia a la luz: sin esto quedaría invisible.
    if (input.publish) await this.db.update(stories).set({ updatedAt: new Date(), published: true }).where(eq(stories.id, story.id));
    return created;
  }

  async setVote(userId: string, slug: string, n: number, on: boolean) {
    const story = await this.row(slug);
    const [chapter] = await this.db.select({ id: chapters.id }).from(chapters).where(and(eq(chapters.storyId, story.id), eq(chapters.n, n), isLive));
    if (!chapter) throw new NotFoundException('No encontramos ese capítulo');
    if (on) await this.db.insert(votes).values({ userId, chapterId: chapter.id }).onConflictDoNothing();
    else await this.db.delete(votes).where(and(eq(votes.userId, userId), eq(votes.chapterId, chapter.id)));
    const [{ c }] = await this.db.select({ c: count() }).from(votes).where(eq(votes.chapterId, chapter.id));
    return { voted: on, votes: c };
  }
}
