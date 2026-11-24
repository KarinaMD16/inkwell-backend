import { Controller, Get, Inject, Query } from '@nestjs/common';
import { and, asc, desc, eq, gt, like, ne, or } from 'drizzle-orm';
import { slugify } from '../common/slug.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB, type Db } from '../db/db.module.js';
import { tags } from '../db/schema.js';
import { tagSearchSchema, type TagSearch } from './stories.schemas.js';

/** Autocompletar etiquetas: las que ya usa alguna historia visible, las más usadas primero. */
@Controller('tags')
export class TagsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
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
}
