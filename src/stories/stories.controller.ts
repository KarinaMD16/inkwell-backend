import { Body, Controller, Delete, Get, Header, Inject, Param, ParseIntPipe, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard, CurrentUser, CurrentViewer, OptionalAuth } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { PublicCacheInterceptor } from '../common/public-cache.interceptor.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService } from '../me/me.service.js';
import {
  createChapterSchema, createStorySchema, type CreateChapter, type CreateStory,
} from './stories.schemas.js';
import type { Viewer } from '../visibility/visibility.js';
import { StoriesService } from './stories.service.js';

@Controller('stories')
export class StoriesController {
  constructor(
    @Inject(StoriesService) private readonly stories: StoriesService,
    @Inject(MeService) private readonly me: MeService,
  ) {}

  // ----- lectura: no pide sesión -----
  // Con sesión, la edad de la cuenta decide qué clasificaciones se ven; sin sesión, hasta +13.
  // La lista y la búsqueda (GET /stories) viven en discovery/discovery.controller.ts.

  @Get(':slug')
  @UseGuards(AuthGuard)
  @OptionalAuth()
  @UseInterceptors(PublicCacheInterceptor)
  get(@Param('slug') slug: string, @CurrentViewer() viewer: Viewer | null) {
    return this.stories.get(slug, viewer);
  }

  @Get(':slug/chapters')
  @UseGuards(AuthGuard)
  @OptionalAuth()
  @UseInterceptors(PublicCacheInterceptor)
  chapters(@Param('slug') slug: string, @CurrentViewer() viewer: Viewer | null) {
    return this.stories.listChapters(slug, viewer);
  }

  /** Sin caché: cada lectura suma al contador y lo que se ve depende de la edad de quien lee. */
  @Get(':slug/chapters/:n')
  @UseGuards(AuthGuard)
  @OptionalAuth()
  @Header('Cache-Control', 'no-store')
  chapter(@Param('slug') slug: string, @Param('n', ParseIntPipe) n: number, @CurrentViewer() viewer: Viewer | null) {
    return this.stories.getChapter(slug, n, viewer);
  }

  // ----- escritura: pide sesión -----
  @Post()
  @UseGuards(AuthGuard)
  async create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createStorySchema)) body: CreateStory) {
    await this.me.getOrCreate(user);
    return this.stories.create(user.id, body);
  }

  @Post(':slug/chapters')
  @UseGuards(AuthGuard)
  addChapter(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body(new ZodPipe(createChapterSchema)) body: CreateChapter) {
    return this.stories.addChapter(user.id, slug, body);
  }

  /** Sin caché: la respuesta depende de quien pregunta. */
  @Get(':slug/chapters/:n/vote')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  myVote(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Param('n', ParseIntPipe) n: number) {
    return this.stories.getVote(user, slug, n);
  }

  @Put(':slug/chapters/:n/vote')
  @UseGuards(AuthGuard)
  async vote(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Param('n', ParseIntPipe) n: number) {
    await this.me.getOrCreate(user);
    return this.stories.setVote(user, slug, n, true);
  }

  @Delete(':slug/chapters/:n/vote')
  @UseGuards(AuthGuard)
  unvote(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Param('n', ParseIntPipe) n: number) {
    return this.stories.setVote(user, slug, n, false);
  }
}
