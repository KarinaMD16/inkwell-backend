import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { BLOCK_ID } from '../stories/block-ids.js';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB, type Db } from '../db/db.module.js';
import { library, profiles, stories } from '../db/schema.js';
import { MeService } from '../me/me.service.js';
import { visibleTo } from '../visibility/visibility.js';

const saveSchema = z.object({ chapter: z.number().int().min(1).default(1) });
const progressSchema = z.strictObject({
  chapter: z.number().int().min(1),
  /** El párrafo por el que vas dentro del capítulo. Sin él, se conserva el que había si sigues en el mismo capítulo. */
  block: z.string().regex(BLOCK_ID, 'Párrafo inválido').nullable().optional(),
});

/** La repisa de la persona: qué historias guardó y por qué capítulo va en cada una. */
@Controller('me/library')
@UseGuards(AuthGuard)
export class LibraryController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MeService) private readonly me: MeService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.db
      .select({ slug: stories.slug, title: stories.title, author: profiles.handle, color: stories.color, ink: stories.ink, art: stories.art, cover: stories.coverUrl, spine: stories.spine, spineImage: stories.spineUrl, chapter: library.chapter, block: library.blockId, updatedAt: library.updatedAt })
      .from(library)
      .innerJoin(stories, eq(library.storyId, stories.id))
      .innerJoin(profiles, eq(stories.authorId, profiles.id))
      .where(eq(library.userId, user.id))
      .orderBy(desc(library.updatedAt));
  }

  /** Guarda la historia en la repisa o actualiza el capítulo por el que va. */
  @Put(':slug')
  async save(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body(new ZodPipe(saveSchema)) body: z.infer<typeof saveSchema>) {
    await this.me.getOrCreate(user);
    // Solo entra lo que esta persona puede ver: nada de guardar una historia retirada o de otra edad.
    const [story] = await this.db.select({ id: stories.id }).from(stories)
      .where(and(eq(stories.slug, slug), visibleTo(this.db, { id: user.id, maxRating: user.maxRating })));
    if (!story) throw new NotFoundException('No encontramos esa historia');
    const now = new Date();
    await this.db
      .insert(library)
      .values({ userId: user.id, storyId: story.id, chapter: body.chapter, updatedAt: now })
      .onConflictDoUpdate({ target: [library.userId, library.storyId], set: { chapter: body.chapter, updatedAt: now } });
    return { slug, chapter: body.chapter };
  }

  /**
   * El lector avisa por qué capítulo vas. Solo cambia algo si la historia ya está en tu repisa:
   * abrir un capítulo nunca la guarda sola (eso es solo con el botón "Poner en mi repisa").
   */
  @Patch(':slug')
  async progress(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body(new ZodPipe(progressSchema)) body: z.infer<typeof progressSchema>) {
    const story = this.db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug));
    // Al abrir un capítulo llega solo `chapter`: si es el mismo, se respeta el párrafo guardado
    // (así "Seguir donde lo dejé" no se borra al entrar); si es otro, se empieza desde arriba.
    const blockId = body.block !== undefined
      ? body.block
      : sql<string | null>`case when ${library.chapter} = ${body.chapter} then ${library.blockId} else null end`;
    const updated = await this.db
      .update(library)
      .set({ chapter: body.chapter, blockId, updatedAt: new Date() })
      .where(and(eq(library.userId, user.id), inArray(library.storyId, story)))
      .returning({ chapter: library.chapter, block: library.blockId });
    return { slug, chapter: body.chapter, block: updated[0]?.block ?? null, saved: updated.length > 0 };
  }

  @Delete(':slug')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    const [story] = await this.db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug));
    if (story) await this.db.delete(library).where(and(eq(library.userId, user.id), eq(library.storyId, story.id)));
  }
}
