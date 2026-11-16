import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, gt, ilike, inArray, isNotNull, isNull, lte, max, notExists, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { fold, slugify } from '../common/slug.js';
import { DB, type Db } from '../db/db.module.js';
import { chapters, profiles, stories, storyTags, tags, votes, type Block } from '../db/schema.js';
import { processImage } from '../storage/images.js';
import { STORAGE, type FileStorage } from '../storage/storage.js';
import type {
  ChapterOrder, CreateChapter, CreateStory, ListQuery, PublishChapter, UpdateChapter, UpdateStory,
} from './stories.schemas.js';
import { recount, saveTags, tagIdsOf, type Tagged, type Tx } from './tagging.js';

type StoryRow = typeof stories.$inferSelect;

/** Un capítulo es visible si tiene fecha de publicación y esa fecha ya pasó. */
const isLive = and(isNotNull(chapters.publishedAt), lte(chapters.publishedAt, sql`now()`));

const stateOf = (publishedAt: Date | null) => (!publishedAt ? 'borrador' : publishedAt > new Date() ? 'programado' : 'publicado');

function countWords(content: Block[]): number {
  const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  return content.reduce((n, b) => n + (b.type === 'chat' ? b.messages.reduce((m, msg) => m + words(msg.text), 0) : words(b.text)), 0);
}

/** Un fanfic sin fandom no se puede encontrar por fandom: se pide siempre. */
function checkFandom(story: Pick<Tagged, 'kind' | 'fandom'>) {
  if (story.kind === 'Fanfic' && (!story.fandom.trim() || story.fandom.trim().toLowerCase() === 'original')) {
    throw new BadRequestException({ message: 'Datos inválidos', errors: [{ campo: 'fandom', error: 'Dinos de qué fandom es tu fanfic' }] });
  }
}

@Injectable()
export class StoriesService {
  private readonly log = new Logger(StoriesService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: FileStorage,
  ) {}

  // ----- lectura pública -----

  private liveOf() {
    return this.db.select({ one: sql`1` }).from(chapters).where(and(eq(chapters.storyId, stories.id), isLive));
  }

  /** La autora tiene la cuenta suspendida. Sirve aunque la consulta no traiga `profiles`. */
  private authorSuspended() {
    return this.db.select({ one: sql`1` }).from(profiles).where(and(eq(profiles.id, stories.authorId), isNotNull(profiles.suspendedAt)));
  }

  /**
   * Lo que el público puede ver: la autora la publicó y ya tiene algo que leer, moderación no la
   * retiró y la cuenta de la autora no está suspendida.
   */
  private visible() {
    return and(eq(stories.published, true), isNull(stories.removedAt), notExists(this.authorSuspended()), exists(this.liveOf()));
  }

  /** Columnas públicas de una historia, con autor, capítulos publicados y votos. */
  private counts() {
    const chapterCount = this.db.select({ c: count() }).from(chapters).where(and(eq(chapters.storyId, stories.id), isLive));
    const voteCount = this.db
      .select({ c: count() })
      .from(votes)
      .innerJoin(chapters, eq(votes.chapterId, chapters.id))
      .where(eq(chapters.storyId, stories.id));
    const lastLive = this.db.select({ m: max(chapters.publishedAt) }).from(chapters).where(and(eq(chapters.storyId, stories.id), isLive));
    return {
      chapters: sql<number>`(${chapterCount})`.mapWith(Number),
      votes: sql<number>`(${voteCount})`.mapWith(Number),
      /** Para quien lee, "actualizada" es cuándo salió su último capítulo, no cuándo se tocó la ficha. */
      updatedAt: sql<Date>`coalesce((${lastLive}), ${stories.updatedAt})`.mapWith(stories.updatedAt),
    };
  }

  private columns() {
    return {
      slug: stories.slug, title: stories.title, author: profiles.handle, tagline: stories.tagline, synopsis: stories.synopsis,
      cover: stories.coverUrl, color: stories.color, ink: stories.ink, art: stories.art, kind: stories.kind, genre: stories.genre,
      subgenres: stories.subgenres, fandom: stories.fandom, relation: stories.relation, characters: stories.characters,
      tropes: stories.tropes, warnings: stories.warnings, tags: stories.freeTags, rating: stories.rating, status: stories.status,
      format: stories.format, license: stories.license, reads: stories.reads,
      ...this.counts(),
    };
  }

  private select() {
    return this.db.select(this.columns()).from(stories).innerJoin(profiles, eq(stories.authorId, profiles.id));
  }

  /** "Tiene esta etiqueta", sin importar la categoría: por aquí pasan los filtros de incluir y excluir. */
  private tagged(slugs: string[]) {
    return this.db.select({ one: sql`1` }).from(storyTags).innerJoin(tags, eq(tags.id, storyTags.tagId))
      .where(and(eq(storyTags.storyId, stories.id), inArray(tags.slug, slugs)));
  }

  async list(query: ListQuery) {
    // Cada palabra se busca por prefijo y sin tildes: "orb baj" encuentra "Órbita baja".
    const terms = query.q ? fold(query.q).split(' ').filter(Boolean) : [];
    const tsquery = terms.map((t) => `${t}:*`).join(' & ');
    const like = query.q ? `%${query.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    const include = (query.tags ?? []).map(slugify).filter(Boolean);
    const exclude = (query.exclude ?? []).map(slugify).filter(Boolean);
    const where = and(
      this.visible(),
      query.genre ? or(eq(stories.genre, query.genre), sql`${query.genre} = any(${stories.subgenres})`) : undefined,
      query.kind ? eq(stories.kind, query.kind) : undefined,
      query.rating ? eq(stories.rating, query.rating) : undefined,
      query.status ? eq(stories.status, query.status) : undefined,
      query.author ? eq(profiles.handle, query.author) : undefined,
      like ? or(tsquery ? sql`to_tsvector('simple', ${stories.searchText}) @@ to_tsquery('simple', ${tsquery})` : undefined, ilike(profiles.handle, like)) : undefined,
      ...include.map((slug) => exists(this.tagged([slug]))),
      exclude.length ? notExists(this.tagged(exclude)) : undefined,
    );
    const totals = this.counts();
    const order = { votos: desc(totals.votes), recientes: desc(totals.updatedAt), lecturas: desc(stories.reads) }[query.sort];
    const items = await this.select().where(where).orderBy(order, asc(stories.slug)).limit(query.limit).offset(query.offset);
    return { items, limit: query.limit, offset: query.offset };
  }

  async get(slug: string) {
    const [story] = await this.select().where(and(eq(stories.slug, slug), this.visible()));
    if (!story) throw new NotFoundException('No encontramos esa historia');
    return story;
  }

  private async row(slug: string) {
    const [row] = await this.db.select().from(stories).where(eq(stories.slug, slug));
    if (!row) throw new NotFoundException('No encontramos esa historia');
    return row;
  }

  /** La historia, solo si su autora la tiene publicada y nada la esconde (retiro o suspensión). */
  private async publicRow(slug: string) {
    const [row] = await this.db.select().from(stories)
      .where(and(eq(stories.slug, slug), eq(stories.published, true), isNull(stories.removedAt), notExists(this.authorSuspended())));
    if (!row) throw new NotFoundException('No encontramos esa historia');
    return row;
  }

  /**
   * Quien lee cuenta solo lo publicado: el capítulo 3 es el tercero que salió, aunque la autora
   * tenga borradores en medio. Así nunca hay huecos entre un capítulo y el siguiente.
   */
  private async liveChapter(storyId: string, n: number) {
    if (n < 1) throw new NotFoundException('No encontramos ese capítulo');
    const [chapter] = await this.db.select().from(chapters).where(and(eq(chapters.storyId, storyId), isLive))
      .orderBy(asc(chapters.n)).limit(1).offset(n - 1);
    if (!chapter) throw new NotFoundException('No encontramos ese capítulo');
    return chapter;
  }

  async listChapters(slug: string) {
    const story = await this.publicRow(slug);
    const list = await this.db
      .select({ title: chapters.title, badge: chapters.badge, publishedAt: chapters.publishedAt })
      .from(chapters)
      .where(and(eq(chapters.storyId, story.id), isLive))
      .orderBy(asc(chapters.n));
    return list.map((c, i) => ({ n: i + 1, ...c }));
  }

  async getChapter(slug: string, n: number) {
    const story = await this.publicRow(slug);
    const chapter = await this.liveChapter(story.id, n);
    // Contador simple de lecturas; más adelante conviene contarlas por persona.
    await this.db.update(stories).set({ reads: sql`${stories.reads} + 1` }).where(eq(stories.id, story.id));
    const [{ c }] = await this.db.select({ c: count() }).from(votes).where(eq(votes.chapterId, chapter.id));
    return { n, title: chapter.title, titleStyle: chapter.titleStyle, badge: chapter.badge, content: chapter.content, publishedAt: chapter.publishedAt, votes: c };
  }

  async setVote(userId: string, slug: string, n: number, on: boolean) {
    const story = await this.publicRow(slug);
    const chapter = await this.liveChapter(story.id, n);
    if (on) await this.db.insert(votes).values({ userId, chapterId: chapter.id }).onConflictDoNothing();
    else await this.db.delete(votes).where(and(eq(votes.userId, userId), eq(votes.chapterId, chapter.id)));
    const [{ c }] = await this.db.select({ c: count() }).from(votes).where(eq(votes.chapterId, chapter.id));
    return { voted: on, votes: c };
  }

  // ----- la historia, para quien la escribe -----

  /** Las historias de quien pregunta, publicadas o no, con el total de capítulos contando borradores. */
  listMine(authorId: string) {
    const allChapters = this.db.select({ c: count() }).from(chapters).where(eq(chapters.storyId, stories.id));
    return this.db
      .select({
        ...this.columns(), published: stories.published, totalChapters: sql<number>`(${allChapters})`.mapWith(Number), updatedAt: stories.updatedAt,
        // La autora ve si moderación se la retiró y por qué.
        removedAt: stories.removedAt, removedReason: stories.removedReason,
      })
      .from(stories)
      .innerJoin(profiles, eq(stories.authorId, profiles.id))
      .where(eq(stories.authorId, authorId))
      .orderBy(desc(stories.updatedAt));
  }

  /** Fila interna, ya comprobado que es de quien pregunta. */
  private async owned(userId: string, slug: string): Promise<StoryRow> {
    const story = await this.row(slug);
    if (story.authorId !== userId) throw new ForbiddenException('Solo quien escribe la historia puede gestionarla');
    return story;
  }

  /** Todo lo que necesita la pantalla de gestión: la ficha completa y los capítulos con su estado. */
  async manage(userId: string, slug: string) {
    const story = await this.owned(userId, slug);
    const [view] = await this.select().where(eq(stories.id, story.id));
    const list = await this.db
      .select({ id: chapters.id, n: chapters.n, title: chapters.title, badge: chapters.badge, words: chapters.words, publishedAt: chapters.publishedAt, updatedAt: chapters.updatedAt })
      .from(chapters)
      .where(eq(chapters.storyId, story.id))
      .orderBy(asc(chapters.n));
    return {
      ...view, published: story.published, totalChapters: list.length, updatedAt: story.updatedAt,
      removedAt: story.removedAt, removedReason: story.removedReason,
      chapterList: list.map((c) => ({ ...c, state: stateOf(c.publishedAt) })),
    };
  }

  async create(authorId: string, input: CreateStory) {
    const { tags: freeTags, ...fields } = input;
    const story = { ...fields, relation: fields.relation ?? null, freeTags };
    checkFandom(story);
    const base = slugify(input.title) || 'historia';
    for (let i = 0; i < 6; i++) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const created = await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(stories).values({ ...story, slug, authorId }).onConflictDoNothing().returning({ id: stories.id, slug: stories.slug });
        if (row) await saveTags(tx, row.id, story);
        return row;
      });
      if (created) return { slug: created.slug };
    }
    throw new ConflictException('Ya existen varias historias con ese título; prueba con otro');
  }

  async update(userId: string, slug: string, patch: UpdateStory) {
    const story = await this.owned(userId, slug);
    const { tags: freeTags, ...fields } = patch;
    const next = { ...story, ...fields, ...(freeTags ? { freeTags } : {}) };
    checkFandom(next);
    await this.db.transaction(async (tx) => {
      await tx.update(stories).set({
        title: next.title, tagline: next.tagline, synopsis: next.synopsis, kind: next.kind, genre: next.genre, rating: next.rating,
        status: next.status, license: next.license, format: next.format, color: next.color, ink: next.ink, art: next.art,
        published: next.published, updatedAt: new Date(),
      }).where(eq(stories.id, story.id));
      // También recuenta los usos: cubre el cambio de etiquetas y el de visibilidad.
      await saveTags(tx, story.id, next);
    });
    return this.manage(userId, slug);
  }

  async remove(userId: string, slug: string) {
    const story = await this.owned(userId, slug);
    await this.db.transaction(async (tx) => {
      const used = await tagIdsOf(tx, story.id);
      await tx.delete(stories).where(eq(stories.id, story.id));
      await recount(tx, used);
    });
    await this.forget(story.coverUrl);
  }

  /** Sube una portada nueva (queda en 800×1200 WebP) y borra la anterior. */
  async setCover(userId: string, slug: string, file: Buffer) {
    const story = await this.owned(userId, slug);
    const webp = await processImage(file, 'cover');
    const key = `covers/${story.id}/${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.webp`;
    const url = await this.storage.put(key, webp, 'image/webp');
    await this.db.update(stories).set({ coverUrl: url, updatedAt: new Date() }).where(eq(stories.id, story.id));
    await this.forget(story.coverUrl);
    return { cover: url };
  }

  async removeCover(userId: string, slug: string) {
    const story = await this.owned(userId, slug);
    await this.db.update(stories).set({ coverUrl: null, updatedAt: new Date() }).where(eq(stories.id, story.id));
    await this.forget(story.coverUrl);
    return { cover: null };
  }

  /** Borrar la imagen vieja es limpieza: si falla, la historia ya quedó bien y solo se avisa en el log. */
  private async forget(url: string | null) {
    if (!url) return;
    try {
      await this.storage.removeByUrl(url);
    } catch (err) {
      this.log.warn(`No se pudo borrar ${url}: ${(err as Error).message}`);
    }
  }

  // ----- capítulos, para quien escribe -----

  private async chapterOf(story: StoryRow, id: string) {
    const [chapter] = await this.db.select().from(chapters).where(and(eq(chapters.id, id), eq(chapters.storyId, story.id)));
    if (!chapter) throw new NotFoundException('No encontramos ese capítulo');
    return chapter;
  }

  private chapterView(c: typeof chapters.$inferSelect) {
    return { id: c.id, n: c.n, title: c.title, badge: c.badge, words: c.words, publishedAt: c.publishedAt, updatedAt: c.updatedAt, state: stateOf(c.publishedAt) };
  }

  /** Publicar algo saca la historia a la luz: sin esto quedaría invisible. */
  private async reveal(tx: Tx, story: StoryRow) {
    await tx.update(stories).set({ published: true, updatedAt: new Date() }).where(eq(stories.id, story.id));
    if (!story.published) await recount(tx, await tagIdsOf(tx, story.id));
  }

  async getMyChapter(userId: string, slug: string, id: string) {
    const chapter = await this.chapterOf(await this.owned(userId, slug), id);
    return { ...this.chapterView(chapter), titleStyle: chapter.titleStyle, content: chapter.content };
  }

  async addChapter(userId: string, slug: string, input: CreateChapter) {
    const story = await this.owned(userId, slug);
    return this.db.transaction(async (tx) => {
      const [{ last }] = await tx.select({ last: sql<number>`coalesce(max(${chapters.n}), 0)`.mapWith(Number) }).from(chapters).where(eq(chapters.storyId, story.id));
      const [created] = await tx
        .insert(chapters)
        .values({
          storyId: story.id, n: last + 1, title: input.title, titleStyle: input.titleStyle, badge: input.badge, content: input.content,
          words: countWords(input.content), publishedAt: input.publish ? new Date() : null,
        })
        .returning();
      if (input.publish) await this.reveal(tx, story);
      else await tx.update(stories).set({ updatedAt: new Date() }).where(eq(stories.id, story.id));
      return this.chapterView(created);
    });
  }

  /** Guarda el capítulo tal como está. Si ya es público, los cambios se ven de inmediato. */
  async updateChapter(userId: string, slug: string, id: string, patch: UpdateChapter) {
    const story = await this.owned(userId, slug);
    await this.chapterOf(story, id);
    const now = new Date();
    const [saved] = await this.db.update(chapters)
      .set({ ...patch, ...(patch.content ? { words: countWords(patch.content) } : {}), updatedAt: now })
      .where(eq(chapters.id, id)).returning();
    await this.db.update(stories).set({ updatedAt: now }).where(eq(stories.id, story.id));
    return this.chapterView(saved);
  }

  async publishChapter(userId: string, slug: string, id: string, input: PublishChapter) {
    const story = await this.owned(userId, slug);
    const chapter = await this.chapterOf(story, id);
    const now = new Date();
    if (input.at && input.at <= now) throw new BadRequestException('Para programar el capítulo elige una fecha que todavía no haya pasado');
    // Volver a publicar algo que ya está publicado no le cambia la fecha.
    const publishedAt = input.at ?? (chapter.publishedAt && chapter.publishedAt <= now ? chapter.publishedAt : now);
    return this.db.transaction(async (tx) => {
      const [saved] = await tx.update(chapters).set({ publishedAt }).where(eq(chapters.id, id)).returning();
      await this.reveal(tx, story);
      return this.chapterView(saved);
    });
  }

  /** De vuelta a borrador: deja de verse, pero no se pierde nada (tampoco sus votos). */
  async unpublishChapter(userId: string, slug: string, id: string) {
    const story = await this.owned(userId, slug);
    await this.chapterOf(story, id);
    const [saved] = await this.db.update(chapters).set({ publishedAt: null }).where(eq(chapters.id, id)).returning();
    return this.chapterView(saved);
  }

  async removeChapter(userId: string, slug: string, id: string) {
    const story = await this.owned(userId, slug);
    const chapter = await this.chapterOf(story, id);
    await this.db.transaction(async (tx) => {
      await tx.delete(chapters).where(eq(chapters.id, id));
      // Cierra el hueco en dos pasos (por negativos) para no chocar con el índice único de (historia, n).
      await tx.update(chapters).set({ n: sql`-${chapters.n}` }).where(and(eq(chapters.storyId, story.id), gt(chapters.n, chapter.n)));
      await tx.update(chapters).set({ n: sql`-${chapters.n} - 1` }).where(and(eq(chapters.storyId, story.id), sql`${chapters.n} < 0`));
    });
  }

  /** Reordena: `ids` trae todos los capítulos de la historia en el orden nuevo. */
  async reorder(userId: string, slug: string, { ids }: ChapterOrder) {
    const story = await this.owned(userId, slug);
    const current = await this.db.select({ id: chapters.id }).from(chapters).where(eq(chapters.storyId, story.id));
    const same = current.length === ids.length && new Set(ids).size === ids.length && current.every((c) => ids.includes(c.id));
    if (!same) throw new BadRequestException('La lista debe traer todos los capítulos de la historia, una sola vez cada uno');
    await this.db.transaction(async (tx) => {
      await tx.update(chapters).set({ n: sql`-${chapters.n}` }).where(eq(chapters.storyId, story.id));
      for (const [i, id] of ids.entries()) await tx.update(chapters).set({ n: i + 1 }).where(eq(chapters.id, id));
    });
    return (await this.manage(userId, slug)).chapterList;
  }
}
