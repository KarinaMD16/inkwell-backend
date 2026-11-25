import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { slugify } from '../common/slug.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB, type Db } from '../db/db.module.js';
import { blockedTags, TAG_KINDS, tags, type TagKind } from '../db/schema.js';
import { MeService } from '../me/me.service.js';
import { blockTagSchema, type BlockTag } from './discovery.schemas.js';

/** Suficientes para afinar lo que una persona no quiere ver; un tope evita consultas enormes. */
const MAX_BLOCKED = 50;

/**
 * Etiquetas que la persona no quiere ver. Las historias que las llevan dejan de salir en sus
 * listas y búsquedas (ver `listedFor` en visibility.ts). Privadas: solo las ve su dueña.
 */
@Controller('me/blocked-tags')
@UseGuards(AuthGuard)
export class BlockedTagsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MeService) private readonly me: MeService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.db.select({ kind: tags.kind, slug: tags.slug, name: tags.name })
      .from(blockedTags).innerJoin(tags, eq(tags.id, blockedTags.tagId))
      .where(eq(blockedTags.userId, user.id)).orderBy(asc(tags.name));
  }

  /** Bloquea una etiqueta. Repetirlo no cambia nada (idempotente). Devuelve la lista completa. */
  @Put()
  async add(@CurrentUser() user: AuthUser, @Body(new ZodPipe(blockTagSchema)) body: BlockTag) {
    await this.me.getOrCreate(user);
    const tag = await this.find(body.kind, body.slug);
    await this.db.transaction(async (tx) => {
      const [{ c }] = await tx.select({ c: count() }).from(blockedTags).where(eq(blockedTags.userId, user.id));
      const already = await tx.select({ one: blockedTags.tagId }).from(blockedTags)
        .where(and(eq(blockedTags.userId, user.id), eq(blockedTags.tagId, tag.id)));
      if (!already.length && c >= MAX_BLOCKED) {
        throw new BadRequestException(`Puedes bloquear hasta ${MAX_BLOCKED} etiquetas. Quita alguna para agregar otra.`);
      }
      await tx.insert(blockedTags).values({ userId: user.id, tagId: tag.id }).onConflictDoNothing();
    });
    return this.list(user);
  }

  @Delete(':kind/:slug')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Param('slug') slug: string) {
    if (!(TAG_KINDS as readonly string[]).includes(kind)) throw new NotFoundException('No encontramos esa etiqueta');
    const [tag] = await this.db.select({ id: tags.id }).from(tags).where(and(eq(tags.kind, kind as TagKind), eq(tags.slug, slugify(slug))));
    if (tag) await this.db.delete(blockedTags).where(and(eq(blockedTags.userId, user.id), eq(blockedTags.tagId, tag.id)));
  }

  private async find(kind: TagKind, slug: string) {
    const [tag] = await this.db.select({ id: tags.id }).from(tags).where(and(eq(tags.kind, kind), eq(tags.slug, slugify(slug))));
    if (!tag) throw new NotFoundException('Esa etiqueta todavía no existe: elige una de las sugerencias.');
    return tag;
  }
}
