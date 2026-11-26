import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isUniqueViolation } from '../common/db-errors.js';
import { DB, type Db } from '../db/db.module.js';
import { LIST_LIMITS, profiles, readingListItems, readingLists, stories } from '../db/schema.js';
import { StoriesService } from '../stories/stories.service.js';
import { visibleTo, type Viewer } from '../visibility/visibility.js';

const name = z.string().trim()
  .min(1, 'Ponle un nombre a tu lista')
  .max(LIST_LIMITS.name, `El nombre puede tener hasta ${LIST_LIMITS.name} caracteres`);

/** Campos de más se rechazan (regla 7). */
export const createListSchema = z.strictObject({ name, isPublic: z.boolean().default(false) });
export const updateListSchema = z.strictObject({ name: name.optional(), isPublic: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isPublic !== undefined, 'No hay nada que cambiar');
export type CreateList = z.infer<typeof createListSchema>;
export type UpdateList = z.infer<typeof updateListSchema>;

const NOT_FOUND = 'No encontramos esa lista';
const SAME_NAME = 'Ya tienes una lista con ese nombre';

/** Un id de lista que no es un uuid no existe: se responde 404 sin preguntarle a la base. */
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Listas de lectura. Solo la dueña cambia una lista; una privada no existe para nadie más (404,
 * igual que un id inventado, para no confirmar que existe). Las historias se filtran siempre por lo
 * que le toca ver a quien mira (edad, retiradas, sin publicar).
 */
@Injectable()
export class ListsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StoriesService) private readonly stories: StoriesService,
  ) {}

  /**
   * Tus listas, de la más reciente a la más vieja, con cuántas historias tiene cada una.
   * Con `slug`, cada lista dice además si ya tiene esa historia (para el menú de la ficha).
   */
  async mine(userId: string, slug?: string) {
    const total = this.db.select({ c: count() }).from(readingListItems).where(eq(readingListItems.listId, readingLists.id));
    // Con el constructor de consultas, cada columna sale con su tabla ("reading_lists"."id"): escrito a mano
    // en sql``, Drizzle las deja sin tabla y "id" terminaba comparándose con el de stories.
    const has = slug
      ? exists(this.db.select({ one: sql`1` }).from(readingListItems)
        .innerJoin(stories, eq(stories.id, readingListItems.storyId))
        .where(and(eq(readingListItems.listId, readingLists.id), eq(stories.slug, slug))))
      : sql<boolean>`false`;
    return this.db
      .select({
        id: readingLists.id, name: readingLists.name, isPublic: readingLists.isPublic,
        stories: sql<number>`(${total})`.mapWith(Number), hasStory: has, updatedAt: readingLists.updatedAt,
      })
      .from(readingLists)
      .where(eq(readingLists.userId, userId))
      .orderBy(desc(readingLists.updatedAt));
  }

  async create(userId: string, input: CreateList) {
    const [{ c }] = await this.db.select({ c: count() }).from(readingLists).where(eq(readingLists.userId, userId));
    if (c >= LIST_LIMITS.perUser) throw new BadRequestException(`Puedes tener hasta ${LIST_LIMITS.perUser} listas. Borra alguna para crear otra.`);
    try {
      const [list] = await this.db.insert(readingLists).values({ userId, name: input.name, isPublic: input.isPublic })
        .returning({ id: readingLists.id, name: readingLists.name, isPublic: readingLists.isPublic, updatedAt: readingLists.updatedAt });
      return { ...list, stories: 0, hasStory: false };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(SAME_NAME);
      throw err;
    }
  }

  async update(userId: string, id: string, patch: UpdateList) {
    await this.owned(userId, id);
    try {
      const [list] = await this.db.update(readingLists).set({ ...patch, updatedAt: new Date() })
        .where(and(eq(readingLists.id, id), eq(readingLists.userId, userId)))
        .returning({ id: readingLists.id, name: readingLists.name, isPublic: readingLists.isPublic, updatedAt: readingLists.updatedAt });
      return list;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(SAME_NAME);
      throw err;
    }
  }

  /** Borrar dos veces deja lo mismo: si ya no existe, no es un error (idempotente). Sus historias se van en cascada. */
  async remove(userId: string, id: string) {
    if (!isUuid(id)) return;
    await this.db.delete(readingLists).where(and(eq(readingLists.id, id), eq(readingLists.userId, userId)));
  }

  /**
   * Una lista con sus historias, en el orden en que se agregaron. La tuya la ves siempre; la de otra
   * persona, solo si es pública. En las dos, solo las historias que te tocan ver.
   */
  async get(viewer: Viewer | null, id: string) {
    if (!isUuid(id)) throw new NotFoundException(NOT_FOUND);
    const [list] = await this.db
      .select({
        id: readingLists.id, userId: readingLists.userId, name: readingLists.name, isPublic: readingLists.isPublic, updatedAt: readingLists.updatedAt,
        owner: { handle: profiles.handle, name: profiles.name, suspendedAt: profiles.suspendedAt },
      })
      .from(readingLists).innerJoin(profiles, eq(profiles.id, readingLists.userId))
      .where(eq(readingLists.id, id));
    const mine = Boolean(viewer && list?.userId === viewer.id);
    // La de otra persona: solo si es pública y su cuenta no está suspendida (su perfil tampoco se ve).
    if (!list || (!mine && (!list.isPublic || list.owner.suspendedAt))) throw new NotFoundException(NOT_FOUND);

    const order = await this.db.select({ storyId: readingListItems.storyId, slug: stories.slug }).from(readingListItems)
      .innerJoin(stories, eq(stories.id, readingListItems.storyId))
      .where(eq(readingListItems.listId, id)).orderBy(asc(readingListItems.addedAt));
    const cards = order.length
      ? await this.stories.cards().where(and(inArray(stories.id, order.map((o) => o.storyId)), visibleTo(this.db, viewer)))
      : [];
    const position = new Map(order.map((o, i) => [o.slug, i]));
    const ordered = [...cards].sort((a, b) => (position.get(a.slug) ?? 0) - (position.get(b.slug) ?? 0));

    return {
      id: list.id, name: list.name, isPublic: list.isPublic, mine, updatedAt: list.updatedAt,
      owner: { handle: list.owner.handle, name: list.owner.name }, stories: ordered,
    };
  }

  /**
   * Las listas públicas de un perfil (para su página). Las privadas nunca salen. El número de historias
   * cuenta solo las que le tocan ver a quien mira, para que no delate las que no puede abrir.
   */
  async publicOf(viewer: Viewer | null, handle: string) {
    const [owner] = await this.db.select({ id: profiles.id }).from(profiles)
      .where(and(eq(profiles.handle, handle), isNull(profiles.suspendedAt)));
    if (!owner) throw new NotFoundException('No encontramos ese perfil');
    const visible = this.db.select({ c: count() }).from(readingListItems)
      .innerJoin(stories, eq(stories.id, readingListItems.storyId))
      .where(and(eq(readingListItems.listId, readingLists.id), visibleTo(this.db, viewer)));
    return this.db
      .select({ id: readingLists.id, name: readingLists.name, stories: sql<number>`(${visible})`.mapWith(Number), updatedAt: readingLists.updatedAt })
      .from(readingLists)
      .where(and(eq(readingLists.userId, owner.id), eq(readingLists.isPublic, true)))
      .orderBy(desc(readingLists.updatedAt));
  }

  /** Agregar dos veces deja una sola copia (idempotente). Solo entra lo que puedes ver. */
  async add(viewer: Viewer, id: string, slug: string) {
    await this.owned(viewer.id, id);
    const [story] = await this.db.select({ id: stories.id }).from(stories)
      .where(and(eq(stories.slug, slug), visibleTo(this.db, viewer)));
    if (!story) throw new NotFoundException('No encontramos esa historia');
    await this.db.transaction(async (tx) => {
      const [{ c }] = await tx.select({ c: count() }).from(readingListItems).where(eq(readingListItems.listId, id));
      if (c >= LIST_LIMITS.stories) throw new BadRequestException(`Una lista puede tener hasta ${LIST_LIMITS.stories} historias.`);
      const added = await tx.insert(readingListItems).values({ listId: id, storyId: story.id }).onConflictDoNothing()
        .returning({ storyId: readingListItems.storyId });
      if (added.length) await tx.update(readingLists).set({ updatedAt: new Date() }).where(eq(readingLists.id, id));
    });
    return { id, slug, added: true };
  }

  /** Quitar dos veces deja lo mismo (idempotente). */
  async removeStory(userId: string, id: string, slug: string) {
    await this.owned(userId, id);
    const story = this.db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug));
    await this.db.delete(readingListItems).where(and(eq(readingListItems.listId, id), inArray(readingListItems.storyId, story)));
    return { id, slug, added: false };
  }

  /** La lista existe y es tuya; si no, 404 (también si es de otra persona: no se confirma que exista). */
  private async owned(userId: string, id: string) {
    if (!isUuid(id)) throw new NotFoundException(NOT_FOUND);
    const [list] = await this.db.select({ id: readingLists.id }).from(readingLists)
      .where(and(eq(readingLists.id, id), eq(readingLists.userId, userId)));
    if (!list) throw new NotFoundException(NOT_FOUND);
  }
}
