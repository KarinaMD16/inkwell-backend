import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, UploadedFile, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { need, upload, type UploadedImage } from '../storage/upload.js';
import {
  orderSchema, publishSchema, updateChapterSchema, updateStorySchema, versionCopySchema,
  type ChapterOrder, type PublishChapter, type UpdateChapter, type UpdateStory, type VersionCopy,
} from './stories.schemas.js';
import { ChapterVersionsService } from './chapter-versions.service.js';
import { StoriesService } from './stories.service.js';

const Id = () => Param('id', new ParseUUIDPipe());
const VersionId = () => Param('versionId', new ParseUUIDPipe());

/**
 * El lado de quien escribe: gestionar sus historias y capítulos, borradores incluidos.
 * Todo pide sesión y solo responde a la autora de la historia.
 */
@Controller('me/stories')
@UseGuards(AuthGuard)
export class MyStoriesController {
  constructor(
    @Inject(StoriesService) private readonly stories: StoriesService,
    @Inject(ChapterVersionsService) private readonly versions: ChapterVersionsService,
  ) {}

  /** Tus historias, incluidas las que aún no publicaste. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.stories.listMine(user.id);
  }

  /** La ficha completa y todos sus capítulos, cada uno con su estado: borrador, programado o publicado. */
  @Get(':slug')
  get(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.stories.manage(user.id, slug);
  }

  /** Cambia los detalles: título, géneros, etiquetas, clasificación, estado… `published: false` la esconde entera. */
  @Patch(':slug')
  update(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body(new ZodPipe(updateStorySchema)) body: UpdateStory) {
    return this.stories.update(user.id, slug, body);
  }

  @Delete(':slug')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.stories.remove(user.id, slug);
  }

  @Put(':slug/cover')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @upload()
  setCover(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @UploadedFile() file?: UploadedImage) {
    return this.stories.setCover(user.id, slug, need(file));
  }

  @Delete(':slug/cover')
  removeCover(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.stories.removeCover(user.id, slug);
  }

  @Put(':slug/spine')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @upload()
  setSpine(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @UploadedFile() file?: UploadedImage) {
    return this.stories.setSpine(user.id, slug, need(file));
  }

  @Delete(':slug/spine')
  removeSpine(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.stories.removeSpine(user.id, slug);
  }

  // ----- capítulos: se identifican por id, porque el número cambia al reordenar -----

  @Put(':slug/chapters/order')
  reorder(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body(new ZodPipe(orderSchema)) body: ChapterOrder) {
    return this.stories.reorder(user.id, slug, body);
  }

  @Get(':slug/chapters/:id')
  chapter(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Id() id: string) {
    return this.stories.getMyChapter(user.id, slug, id);
  }

  @Patch(':slug/chapters/:id')
  save(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Id() id: string, @Body(new ZodPipe(updateChapterSchema)) body: UpdateChapter) {
    return this.stories.updateChapter(user.id, slug, id, body);
  }

  /** Publica ya o, con `at`, programa para esa fecha. */
  @Post(':slug/chapters/:id/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Id() id: string, @Body(new ZodPipe(publishSchema)) body: PublishChapter) {
    return this.stories.publishChapter(user.id, slug, id, body);
  }

  @Post(':slug/chapters/:id/unpublish')
  @HttpCode(200)
  unpublish(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Id() id: string) {
    return this.stories.unpublishChapter(user.id, slug, id);
  }

  // ----- historial de versiones de un capítulo -----

  @Get(':slug/chapters/:id/versions')
  listVersions(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Id() id: string) {
    return this.versions.list(user.id, slug, id);
  }

  @Get(':slug/chapters/:id/versions/:versionId')
  version(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Id() id: string, @VersionId() versionId: string) {
    return this.versions.get(user.id, slug, id, versionId);
  }

  /** Vuelve el capítulo a esa versión (antes guarda cómo estaba). */
  @Post(':slug/chapters/:id/versions/:versionId/restore')
  @HttpCode(200)
  restore(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Id() id: string, @VersionId() versionId: string) {
    return this.versions.restore(user.id, slug, id, versionId);
  }

  /** Guarda aparte una versión sin aplicarla (la propia, al elegir la otra en un conflicto). */
  @Post(':slug/chapters/:id/versions')
  @HttpCode(201)
  saveCopy(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Id() id: string, @Body(new ZodPipe(versionCopySchema)) body: VersionCopy) {
    return this.versions.saveCopy(user.id, slug, id, body);
  }

  @Delete(':slug/chapters/:id')
  @HttpCode(204)
  removeChapter(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Id() id: string) {
    return this.stories.removeChapter(user.id, slug, id);
  }
}
