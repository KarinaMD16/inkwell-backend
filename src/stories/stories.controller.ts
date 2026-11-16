import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService } from '../me/me.service.js';
import {
  createChapterSchema, createStorySchema, listSchema, type CreateChapter, type CreateStory, type ListQuery,
} from './stories.schemas.js';
import { StoriesService } from './stories.service.js';

@Controller('stories')
export class StoriesController {
  constructor(
    @Inject(StoriesService) private readonly stories: StoriesService,
    @Inject(MeService) private readonly me: MeService,
  ) {}

  // ----- lectura: no pide sesión -----
  /** Publicadas. Filtros: q, genre, kind, rating, status, author, tags (incluir) y exclude (excluir). */
  @Get()
  list(@Query(new ZodPipe(listSchema)) query: ListQuery) {
    return this.stories.list(query);
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.stories.get(slug);
  }

  @Get(':slug/chapters')
  chapters(@Param('slug') slug: string) {
    return this.stories.listChapters(slug);
  }

  @Get(':slug/chapters/:n')
  chapter(@Param('slug') slug: string, @Param('n', ParseIntPipe) n: number) {
    return this.stories.getChapter(slug, n);
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

  @Put(':slug/chapters/:n/vote')
  @UseGuards(AuthGuard)
  async vote(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Param('n', ParseIntPipe) n: number) {
    await this.me.getOrCreate(user);
    return this.stories.setVote(user.id, slug, n, true);
  }

  @Delete(':slug/chapters/:n/vote')
  @UseGuards(AuthGuard)
  unvote(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Param('n', ParseIntPipe) n: number) {
    return this.stories.setVote(user.id, slug, n, false);
  }
}
