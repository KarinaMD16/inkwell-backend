import {
  BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, ParseIntPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard, CurrentUser, CurrentViewer, OptionalAuth } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService } from '../me/me.service.js';
import { BLOCK_ID } from '../stories/block-ids.js';
import type { Viewer } from '../visibility/visibility.js';
import { CommentsService, createCommentSchema, updateCommentSchema, type CreateComment } from './comments.service.js';

/** Escribir y editar comentarios: de sobra para conversar, y frena el spam (regla 8). */
const WRITE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/** Comentarios de un capítulo: leerlos no pide cuenta; escribir, sí. */
@Controller('stories/:slug/chapters/:n/comments')
@UseGuards(AuthGuard)
export class ChapterCommentsController {
  constructor(
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(MeService) private readonly me: MeService,
  ) {}

  /** `?block=<id>` para los de un párrafo; `?page=1` para la siguiente página. */
  @Get()
  @OptionalAuth()
  @Header('Cache-Control', 'no-store')
  list(
    @Param('slug') slug: string, @Param('n', ParseIntPipe) n: number, @CurrentViewer() viewer: Viewer | null,
    @Query('block') block?: string, @Query('page') page?: string,
  ) {
    if (block && !BLOCK_ID.test(block)) throw new BadRequestException('Párrafo inválido');
    const p = Math.max(0, Math.min(500, Number.parseInt(page ?? '0', 10) || 0));
    return this.comments.list(slug, n, viewer, { block: block || undefined, page: p });
  }

  /** Cuántos comentarios tiene el capítulo y cada párrafo. */
  @Get('counts')
  @OptionalAuth()
  @Header('Cache-Control', 'no-store')
  counts(@Param('slug') slug: string, @Param('n', ParseIntPipe) n: number, @CurrentViewer() viewer: Viewer | null) {
    return this.comments.counts(slug, n, viewer);
  }

  @Post()
  @Throttle(WRITE_LIMIT)
  async create(
    @CurrentUser() user: AuthUser, @Param('slug') slug: string, @Param('n', ParseIntPipe) n: number,
    @Body(new ZodPipe(createCommentSchema)) body: CreateComment,
  ) {
    await this.me.getOrCreate(user);
    return this.comments.create(user, slug, n, body);
  }
}

/** Editar y borrar un comentario propio, por su id. */
@Controller('comments')
@UseGuards(AuthGuard)
export class CommentsController {
  constructor(@Inject(CommentsService) private readonly comments: CommentsService) {}

  @Patch(':id')
  @Throttle(WRITE_LIMIT)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(updateCommentSchema)) body: { body: string }) {
    return this.comments.update(user, id, body.body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.comments.remove(user.id, id);
  }
}
