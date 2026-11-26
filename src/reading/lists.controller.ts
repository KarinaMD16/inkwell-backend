import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService } from '../me/me.service.js';
import {
  createListSchema, ListsService, updateListSchema, type CreateList, type UpdateList,
} from './lists.service.js';

/** Crear listas: de sobra para una persona y frena a un bot (regla 8). */
const CREATE_LIMIT = { default: { limit: 20, ttl: 60_000 } };

/** Tus listas de lectura. Todo pide sesión y solo toca listas tuyas. */
@Controller('me/lists')
@UseGuards(AuthGuard)
export class ListsController {
  constructor(
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(MeService) private readonly me: MeService,
  ) {}

  /** Con `?story=slug`, cada lista dice si ya tiene esa historia (menú "Agregar a una lista" de la ficha). */
  @Get()
  @Header('Cache-Control', 'no-store')
  mine(@CurrentUser() user: AuthUser, @Query('story') story?: string) {
    return this.lists.mine(user.id, story || undefined);
  }

  @Post()
  @Throttle(CREATE_LIMIT)
  async create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createListSchema)) body: CreateList) {
    await this.me.getOrCreate(user);
    return this.lists.create(user.id, body);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lists.get(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(updateListSchema)) body: UpdateList) {
    return this.lists.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lists.remove(user.id, id);
  }

  @Put(':id/stories/:slug')
  add(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('slug') slug: string) {
    return this.lists.add(user, id, slug);
  }

  @Delete(':id/stories/:slug')
  removeStory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('slug') slug: string) {
    return this.lists.removeStory(user.id, id, slug);
  }
}
