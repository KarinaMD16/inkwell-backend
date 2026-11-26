import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from '../db/db.module.js';
import { COMMENT_MAX, comments, profiles } from '../db/schema.js';
import { BLOCK_ID } from '../stories/block-ids.js';
import { StoriesService } from '../stories/stories.service.js';
import type { Viewer } from '../visibility/visibility.js';

const body = z.string().trim()
  .min(1, 'Escribe algo antes de publicar')
  .max(COMMENT_MAX, `Un comentario puede tener hasta ${COMMENT_MAX} caracteres`);

/** Campos de más se rechazan (regla 7). */
export const createCommentSchema = z.strictObject({
  body,
  /** Para responder: el comentario al que se responde. */
  parentId: z.uuid('Comentario inválido').optional(),
  /** Para comentar un párrafo: su id estable. */
  block: z.string().regex(BLOCK_ID, 'Párrafo inválido').optional(),
});
export const updateCommentSchema = z.strictObject({ body });
export type CreateComment = z.infer<typeof createCommentSchema>;

/** Cuántos comentarios principales se muestran de una vez. */
export const COMMENTS_PAGE = 20;

const NOT_FOUND = 'No encontramos ese comentario';
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

interface CommentRow {
  id: string; parentId: string | null; blockId: string | null; body: string;
  createdAt: Date; editedAt: Date | null; deletedAt: Date | null; authorId: string;
  author: { handle: string; name: string; avatarUrl: string | null };
}

/**
 * Comentarios de un capítulo. Se comenta solo lo que se puede leer (edad, publicado, sin retirar);
 * cada quien edita y borra solo lo suyo. El correo verificado lo exige ya AuthGuard: sin confirmar
 * el correo no hay sesión (regla 19).
 * Punto de contacto (Orlando): cuando existan los bloqueos, `create` debe preguntar "puede interactuar"
 * con la autora de la historia y con quien escribió el comentario al que se responde.
 */
@Injectable()
export class CommentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StoriesService) private readonly stories: StoriesService,
  ) {}

  /**
   * Una página de comentarios principales (los más nuevos primero), cada uno con todas sus respuestas
   * (las más viejas primero, como una conversación). Con `block`, solo los de ese párrafo.
   */
  async list(slug: string, n: number, viewer: Viewer | null, opts: { block?: string; page: number }) {
    const { chapterId, authorId: storyAuthor } = await this.stories.readableChapter(slug, n, viewer);
    const where = and(
      eq(comments.chapterId, chapterId), isNull(comments.parentId),
      opts.block ? eq(comments.blockId, opts.block) : undefined,
    );
    const [roots, [{ total }]] = await Promise.all([
      this.rows().where(where).orderBy(desc(comments.createdAt)).limit(COMMENTS_PAGE + 1).offset(opts.page * COMMENTS_PAGE),
      // El total cuenta también las respuestas: es el número que se ve junto a "Comentarios".
      this.db.select({ total: count() }).from(comments).where(and(
        eq(comments.chapterId, chapterId), isNull(comments.deletedAt), opts.block ? eq(comments.blockId, opts.block) : undefined,
      )),
    ]);
    const more = roots.length > COMMENTS_PAGE;
    const shown = roots.slice(0, COMMENTS_PAGE);
    const replies = shown.length
      ? await this.rows().where(inArray(comments.parentId, shown.map((r) => r.id))).orderBy(asc(comments.createdAt))
      : [];
    const view = (c: CommentRow) => this.view(c, viewer, storyAuthor);
    return {
      total,
      more,
      comments: shown
        .map((root) => ({ ...view(root), replies: replies.filter((r) => r.parentId === root.id).map(view) }))
        // Un comentario borrado sin respuestas ya no dice nada: no se muestra.
        .filter((c) => !c.deleted || c.replies.length > 0),
    };
  }

  /** Cuántos comentarios tiene cada párrafo del capítulo (para los globitos del lector). */
  async counts(slug: string, n: number, viewer: Viewer | null) {
    const { chapterId } = await this.stories.readableChapter(slug, n, viewer);
    const rows = await this.db.select({ block: comments.blockId, c: count() }).from(comments)
      .where(and(eq(comments.chapterId, chapterId), isNull(comments.deletedAt)))
      .groupBy(comments.blockId);
    const byBlock: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      total += r.c;
      if (r.block) byBlock[r.block] = r.c;
    }
    return { total, byBlock };
  }

  async create(viewer: Viewer, slug: string, n: number, input: CreateComment) {
    const { chapterId, content, authorId: storyAuthor } = await this.stories.readableChapter(slug, n, viewer);
    let parentId: string | null = null;
    let blockId = input.block ?? null;
    if (input.parentId) {
      const [parent] = await this.db.select({ id: comments.id, parentId: comments.parentId, blockId: comments.blockId, deletedAt: comments.deletedAt })
        .from(comments).where(and(eq(comments.id, input.parentId), eq(comments.chapterId, chapterId)));
      if (!parent) throw new NotFoundException('No encontramos el comentario al que respondes');
      // Un solo nivel de respuestas: responder a una respuesta cuelga del mismo comentario principal.
      parentId = parent.parentId ?? parent.id;
      blockId = parent.blockId;
    } else if (blockId && !content.some((b) => b.id === blockId)) {
      throw new BadRequestException('Ese párrafo ya no está en el capítulo');
    }
    const [created] = await this.db.insert(comments)
      .values({ chapterId, authorId: viewer.id, parentId, blockId, body: input.body })
      .returning({ id: comments.id });
    const [row] = await this.rows().where(eq(comments.id, created.id));
    return { ...this.view(row, viewer, storyAuthor), replies: [] };
  }

  async update(viewer: Viewer, id: string, text: string) {
    await this.own(viewer.id, id);
    await this.db.update(comments).set({ body: text, editedAt: new Date() }).where(eq(comments.id, id));
    const [row] = await this.rows().where(eq(comments.id, id));
    return this.view(row, viewer, null);
  }

  /**
   * Borrar lo propio. Si tiene respuestas, se vacía y queda como "comentario borrado" para no
   * romper la conversación; si no, se borra del todo. Borrar dos veces no es un error (idempotente).
   */
  async remove(viewerId: string, id: string) {
    if (!isUuid(id)) return;
    const [found] = await this.db.select({ id: comments.id, authorId: comments.authorId }).from(comments).where(eq(comments.id, id));
    if (!found) return;
    if (found.authorId !== viewerId) throw new NotFoundException(NOT_FOUND);
    const [{ c }] = await this.db.select({ c: count() }).from(comments).where(eq(comments.parentId, id));
    if (c > 0) await this.db.update(comments).set({ body: '', deletedAt: new Date() }).where(eq(comments.id, id));
    else await this.db.delete(comments).where(eq(comments.id, id));
  }

  private rows() {
    return this.db
      .select({
        id: comments.id, parentId: comments.parentId, blockId: comments.blockId, body: comments.body,
        createdAt: comments.createdAt, editedAt: comments.editedAt, deletedAt: comments.deletedAt, authorId: comments.authorId,
        author: { handle: profiles.handle, name: profiles.name, avatarUrl: profiles.avatarUrl },
      })
      .from(comments).innerJoin(profiles, eq(profiles.id, comments.authorId));
  }

  /** Lo que ve quien lee: sin ids internos de cuentas; de un comentario borrado, ni el texto ni la autora. */
  private view(c: CommentRow, viewer: Viewer | null, storyAuthor: string | null) {
    const deleted = Boolean(c.deletedAt);
    return {
      id: c.id, block: c.blockId, createdAt: c.createdAt, edited: Boolean(c.editedAt), deleted,
      body: deleted ? '' : c.body,
      author: deleted ? null : { ...c.author, isStoryAuthor: c.authorId === storyAuthor },
      mine: !deleted && viewer?.id === c.authorId,
    };
  }

  /** El comentario existe, está vivo y es tuyo; si no, 404 (no se confirma que exista). */
  private async own(viewerId: string, id: string) {
    if (!isUuid(id)) throw new NotFoundException(NOT_FOUND);
    const [found] = await this.db.select({ id: comments.id }).from(comments)
      .where(and(eq(comments.id, id), eq(comments.authorId, viewerId), isNull(comments.deletedAt)));
    if (!found) throw new NotFoundException(NOT_FOUND);
  }
}

