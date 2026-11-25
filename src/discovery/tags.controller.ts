import { Controller, Get, Inject, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { and, asc, desc, eq, gt, like, ne, or } from 'drizzle-orm';
import { AuthGuard, CurrentViewer, OptionalAuth } from '../auth/auth.guard.js';
import { PublicCacheInterceptor } from '../common/public-cache.interceptor.js';
import { slugify } from '../common/slug.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB, type Db } from '../db/db.module.js';
import { tags } from '../db/schema.js';
import type { Viewer } from '../visibility/visibility.js';
import { sectionsSchema, tagSearchSchema, type SectionsQuery, type TagSearch } from './discovery.schemas.js';
import { DiscoveryService } from './discovery.service.js';

@Controller('tags')
export class TagsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
  ) {}

  /**
   * Autocompletar etiquetas, por categoría (`kind`) o de todas a la vez: las que ya usa alguna
   * historia visible, las más usadas primero. Sin `q`, las más usadas (para los filtros).
   */
  @Get()
  @UseInterceptors(PublicCacheInterceptor)
  search(@Query(new ZodPipe(tagSearchSchema)) query: TagSearch) {
    const slug = slugify(query.q);
    return this.db
      .select({ kind: tags.kind, name: tags.name, slug: tags.slug, uses: tags.uses })
      .from(tags)
      .where(and(
        gt(tags.uses, 0),
        // Los géneros son una lista fija; no se autocompletan.
        query.kind ? eq(tags.kind, query.kind) : ne(tags.kind, 'genero'),
        // Coincide el inicio de la etiqueta o el de cualquiera de sus palabras: "burn" encuentra "slow-burn".
        slug ? or(like(tags.slug, `${slug}%`), like(tags.slug, `%-${slug}%`)) : undefined,
      ))
      .orderBy(desc(tags.uses), asc(tags.name))
      .limit(query.limit);
  }

  /** Lo nuevo y lo popular (votos de los últimos 30 días) con esta etiqueta. */
  @Get(':tag/sections')
  @UseGuards(AuthGuard)
  @OptionalAuth()
  @UseInterceptors(PublicCacheInterceptor)
  sections(@Param('tag') tag: string, @Query(new ZodPipe(sectionsSchema.omit({ tag: true }))) query: Omit<SectionsQuery, 'tag'>, @CurrentViewer() viewer: Viewer | null) {
    return this.discovery.sections({ ...query, tag }, viewer);
  }
}
