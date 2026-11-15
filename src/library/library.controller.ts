import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB, type Db } from '../db/db.module.js';
import { library, profiles, stories } from '../db/schema.js';
import { MeService } from '../me/me.service.js';

const saveSchema = z.object({ chapter: z.number().int().min(1).default(1) });

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
      .select({ slug: stories.slug, title: stories.title, author: profiles.handle, color: stories.color, ink: stories.ink, art: stories.art, cover: stories.coverUrl, chapter: library.chapter, updatedAt: library.updatedAt })
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
    const [story] = await this.db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug));
    if (!story) throw new NotFoundException('No encontramos esa historia');
    const now = new Date();
    await this.db
      .insert(library)
      .values({ userId: user.id, storyId: story.id, chapter: body.chapter, updatedAt: now })
      .onConflictDoUpdate({ target: [library.userId, library.storyId], set: { chapter: body.chapter, updatedAt: now } });
    return { slug, chapter: body.chapter };
  }

  @Delete(':slug')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    const [story] = await this.db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug));
    if (story) await this.db.delete(library).where(and(eq(library.userId, user.id), eq(library.storyId, story.id)));
  }
}
