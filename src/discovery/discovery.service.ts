import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, gte, ilike, inArray, notExists, or, sql, type SQL } from 'drizzle-orm';
import { fold, slugify } from '../common/slug.js';
import { DB, type Db } from '../db/db.module.js';
import { chapters, profiles, stories, storyTags, tags, votes, type TagKind } from '../db/schema.js';
import { StoriesService } from '../stories/stories.service.js';
import { listedFor, type Viewer } from '../visibility/visibility.js';
import type { ListQuery, SectionsQuery } from './discovery.schemas.js';

/** Ventana de "popular ahora": votos de los últimos 30 días. */
const POPULAR_DAYS = 30;

/**
 * Descubrir historias: búsqueda, filtros de Explorar y secciones por etiqueta. Todo pasa por
 * `listedFor` (edad y etiquetas bloqueadas de quien lee). Las columnas de cada tarjeta las pone
 * StoriesService (`cards()`), para que la ficha y las listas muestren lo mismo.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StoriesService) private readonly stories: StoriesService,
  ) {}

  /** "Tiene alguna de estas etiquetas" (de la categoría dada, si se da). */
  private tagged(slugs: string[], kind?: TagKind) {
    return this.db.select({ one: sql`1` }).from(storyTags).innerJoin(tags, eq(tags.id, storyTags.tagId))
      .where(and(eq(storyTags.storyId, stories.id), inArray(tags.slug, slugs), kind ? eq(tags.kind, kind) : undefined));
  }

  /** Votos recibidos en los últimos 30 días: lo que hoy se está leyendo. */
  private recentVotes() {
    const since = sql`now() - make_interval(days => ${POPULAR_DAYS})`;
    const recent = this.db.select({ c: count() }).from(votes).innerJoin(chapters, eq(votes.chapterId, chapters.id))
      .where(and(eq(chapters.storyId, stories.id), gte(votes.createdAt, since)));
    return sql<number>`(${recent})`;
  }

  /** Cada palabra por prefijo y sin tildes: "orb baj" encuentra "Órbita baja". */
  private tsquery(q: string | undefined): string | null {
    const terms = q ? fold(q).split(' ').map((t) => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean) : [];
    return terms.length ? terms.map((t) => `${t}:*`).join(' & ') : null;
  }

  async list(query: ListQuery, viewer: Viewer | null) {
    const totals = this.stories.counts();
    const tsquery = this.tsquery(query.q);
    const like = query.q ? `%${query.q.replace(/^@/, '').replace(/[%_\\]/g, '\\$&')}%` : null;
    const vector = sql`to_tsvector('simple', ${stories.searchText})`;
    const include = (query.tags ?? []).map(slugify).filter(Boolean);
    const exclude = (query.exclude ?? []).map(slugify).filter(Boolean);
    const fandoms = (query.fandom ?? []).map(slugify).filter(Boolean);
    const lengths: Record<string, SQL> = {
      corta: sql`${totals.chapters} < 15`,
      media: sql`${totals.chapters} between 15 and 30`,
      larga: sql`${totals.chapters} > 30`,
    };

    const where = and(
      listedFor(this.db, viewer),
      query.genre?.length ? or(...query.genre.map((g) => or(eq(stories.genre, g), sql`${g} = any(${stories.subgenres})`))) : undefined,
      fandoms.length ? exists(this.tagged(fandoms, 'fandom')) : undefined,
      query.kind ? eq(stories.kind, query.kind) : undefined,
      query.rating?.length ? inArray(stories.rating, query.rating) : undefined,
      query.status?.length ? inArray(stories.status, query.status) : undefined,
      query.format?.length ? inArray(stories.format, query.format) : undefined,
      query.length?.length ? or(...query.length.map((l) => lengths[l])) : undefined,
      query.updated ? sql`${totals.updatedAt} >= now() - make_interval(days => ${query.updated === 'semana' ? 7 : 30})` : undefined,
      query.author ? eq(profiles.handle, query.author.replace(/^@/, '')) : undefined,
      like ? or(tsquery ? sql`${vector} @@ to_tsquery('simple', ${tsquery})` : undefined, ilike(profiles.handle, like)) : undefined,
      ...include.map((slug) => exists(this.tagged([slug]))),
      exclude.length ? notExists(this.tagged(exclude)) : undefined,
    );

    const sort = query.sort === 'relevancia' && !tsquery ? 'votos' : query.sort;
    const order = {
      relevancia: desc(sql`ts_rank(${vector}, to_tsquery('simple', ${tsquery ?? ''}))`),
      populares: desc(this.recentVotes()),
      votos: desc(totals.votes),
      recientes: desc(totals.updatedAt),
      lecturas: desc(stories.reads),
    }[sort];
    // Uno de más para saber si hay otra página sin contar todo.
    const rows = await this.stories.cards().where(where)
      .orderBy(order, desc(totals.votes), asc(stories.slug)).limit(query.limit + 1).offset(query.offset);
    return { items: rows.slice(0, query.limit), limit: query.limit, offset: query.offset, hasMore: rows.length > query.limit };
  }

  /** Lo nuevo y lo popular con una etiqueta, para las secciones de Explorar. */
  async sections(query: SectionsQuery, viewer: Viewer | null) {
    const slug = slugify(query.tag);
    const [tag] = await this.db.select({ kind: tags.kind, name: tags.name, slug: tags.slug }).from(tags)
      .where(eq(tags.slug, slug)).orderBy(desc(tags.uses)).limit(1);
    if (!tag) return { tag: null, nuevas: [], populares: [] };
    const base = { tags: [slug], limit: query.limit, offset: 0 };
    const [nuevas, populares] = await Promise.all([
      this.list({ ...base, sort: 'recientes' }, viewer),
      this.list({ ...base, sort: 'populares' }, viewer),
    ]);
    return { tag, nuevas: nuevas.items, populares: populares.items };
  }
}
