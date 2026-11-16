import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { AUTH_DIRECTORY, type AuthDirectory } from '../auth/auth-directory.js';
import { rank } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { DB, type Db } from '../db/db.module.js';
import { adminActions, chapters, profiles, stories, type Role } from '../db/schema.js';
import { AccountsService } from '../me/accounts.service.js';
import { recount, tagIdsOf, tagIdsOfAuthor, type Tx } from '../stories/tagging.js';
import type { StoriesQuery, UsersQuery } from './admin.schemas.js';

const escapeLike = (text: string) => `%${text.replace(/[%_\\]/g, '\\$&')}%`;

/**
 * Moderación y administración. Las reglas de permisos viven aquí, no en la pantalla:
 * - Nadie se suspende, se borra ni se cambia el rol a sí mismo.
 * - Solo se modera a quien tiene menos permisos: moderación modera a quien lee; administración
 *   también a moderación. Una cuenta admin no se suspende ni se borra desde el panel.
 * - Todo lo que cambia algo queda en admin_actions.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUTH_DIRECTORY) private readonly directory: AuthDirectory,
    @Inject(AccountsService) private readonly accounts: AccountsService,
  ) {}

  // ----- personas -----

  async listUsers(query: UsersQuery) {
    let search: SQL | undefined;
    if (query.q) {
      const byEmail = await this.directory.findByEmail(query.q);
      search = or(ilike(profiles.handle, escapeLike(query.q)), ilike(profiles.name, escapeLike(query.q)), byEmail.length ? inArray(profiles.id, byEmail) : undefined);
    }
    const where = and(
      search,
      query.role ? eq(profiles.role, query.role) : undefined,
      query.estado === 'suspendidas' ? isNotNull(profiles.suspendedAt) : query.estado === 'activas' ? isNull(profiles.suspendedAt) : undefined,
    );
    const items = await this.users(where, query.limit, query.offset);
    const [{ total }] = await this.db.select({ total: count() }).from(profiles).where(where);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  /** Cuentas con lo que necesita el panel: rol, estado, cuántas historias, correo y último acceso. */
  private async users(where: SQL | undefined, limit: number, offset: number) {
    const storyCount = this.db.select({ c: count() }).from(stories).where(eq(stories.authorId, profiles.id));
    const rows = await this.db
      .select({
        id: profiles.id, handle: profiles.handle, name: profiles.name, avatarUrl: profiles.avatarUrl, role: profiles.role,
        suspendedAt: profiles.suspendedAt, suspendedReason: profiles.suspendedReason, createdAt: profiles.createdAt,
        stories: sql<number>`(${storyCount})`.mapWith(Number),
      })
      .from(profiles)
      .where(where)
      .orderBy(desc(profiles.createdAt), profiles.handle)
      .limit(limit)
      .offset(offset);
    const accounts = await this.directory.lookup(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, email: accounts.get(r.id)?.email ?? null, lastSignInAt: accounts.get(r.id)?.lastSignInAt ?? null }));
  }

  async setRole(actor: AuthUser, id: string, role: Role) {
    const target = await this.target(id);
    if (target.id === actor.id) throw new ForbiddenException('No puedes cambiar tu propio rol');
    // Como nadie cambia su propio rol, quien actúa sigue siendo admin: nunca se queda sin cuentas admin.
    if (target.role === role) return this.userView(target.id);
    await this.db.transaction(async (tx) => {
      await tx.update(profiles).set({ role, updatedAt: new Date() }).where(eq(profiles.id, id));
      await this.record(tx, actor, 'rol', 'perfil', id, `@${target.handle}`, `${target.role} → ${role}`);
    });
    return this.userView(id);
  }

  async suspend(actor: AuthUser, id: string, reason: string) {
    const target = await this.moderatable(actor, id, 'suspender');
    await this.db.transaction(async (tx) => {
      await tx.update(profiles).set({ suspendedAt: target.suspendedAt ?? new Date(), suspendedReason: reason, updatedAt: new Date() }).where(eq(profiles.id, id));
      await recount(tx, await tagIdsOfAuthor(tx, id));
      await this.record(tx, actor, 'suspender', 'perfil', id, `@${target.handle}`, reason);
    });
    return this.userView(id);
  }

  async unsuspend(actor: AuthUser, id: string) {
    const target = await this.moderatable(actor, id, 'reactivar');
    if (!target.suspendedAt) return this.userView(id);
    await this.db.transaction(async (tx) => {
      await tx.update(profiles).set({ suspendedAt: null, suspendedReason: null, updatedAt: new Date() }).where(eq(profiles.id, id));
      await recount(tx, await tagIdsOfAuthor(tx, id));
      await this.record(tx, actor, 'reactivar', 'perfil', id, `@${target.handle}`, null);
    });
    return this.userView(id);
  }

  async deleteUser(actor: AuthUser, id: string) {
    const target = await this.moderatable(actor, id, 'borrar');
    // El registro va primero: la cuenta deja de existir y luego no habría a quién nombrar.
    await this.record(this.db, actor, 'borrar cuenta', 'perfil', id, `@${target.handle}`, null);
    await this.accounts.delete(id);
  }

  // ----- historias -----

  async listStories(query: StoriesQuery) {
    const where = and(
      query.q ? or(ilike(stories.title, escapeLike(query.q)), ilike(profiles.handle, escapeLike(query.q))) : undefined,
      query.estado === 'retiradas' ? isNotNull(stories.removedAt) : query.estado === 'visibles' ? isNull(stories.removedAt) : undefined,
    );
    const total = this.db.select({ c: count() }).from(chapters).where(eq(chapters.storyId, stories.id));
    const rows = await this.db
      .select({
        slug: stories.slug, title: stories.title, author: profiles.handle, authorSuspended: sql<boolean>`${profiles.suspendedAt} is not null`,
        cover: stories.coverUrl, color: stories.color, ink: stories.ink, art: stories.art, rating: stories.rating,
        published: stories.published, removedAt: stories.removedAt, removedReason: stories.removedReason, reads: stories.reads,
        chapters: sql<number>`(${total})`.mapWith(Number), createdAt: stories.createdAt, updatedAt: stories.updatedAt,
      })
      .from(stories)
      .innerJoin(profiles, eq(stories.authorId, profiles.id))
      .where(where)
      .orderBy(desc(stories.updatedAt), stories.slug)
      .limit(query.limit)
      .offset(query.offset);
    const [{ count: n }] = await this.db.select({ count: count() }).from(stories).innerJoin(profiles, eq(stories.authorId, profiles.id)).where(where);
    return { items: rows, total: n, limit: query.limit, offset: query.offset };
  }

  async removeStory(actor: AuthUser, slug: string, reason: string) {
    const story = await this.story(slug);
    await this.db.transaction(async (tx) => {
      await tx.update(stories).set({ removedAt: story.removedAt ?? new Date(), removedReason: reason }).where(eq(stories.id, story.id));
      await recount(tx, await tagIdsOf(tx, story.id));
      await this.record(tx, actor, 'retirar', 'historia', story.slug, story.title, reason);
    });
    return { slug, removedAt: (await this.story(slug)).removedAt, removedReason: reason };
  }

  async restoreStory(actor: AuthUser, slug: string) {
    const story = await this.story(slug);
    if (story.removedAt) {
      await this.db.transaction(async (tx) => {
        await tx.update(stories).set({ removedAt: null, removedReason: null }).where(eq(stories.id, story.id));
        await recount(tx, await tagIdsOf(tx, story.id));
        await this.record(tx, actor, 'restaurar', 'historia', story.slug, story.title, null);
      });
    }
    return { slug, removedAt: null, removedReason: null };
  }

  // ----- registro -----

  actions(limit: number) {
    return this.db.select({
      id: adminActions.id, actor: adminActions.actorHandle, action: adminActions.action, targetKind: adminActions.targetKind,
      target: adminActions.target, targetLabel: adminActions.targetLabel, detail: adminActions.detail, createdAt: adminActions.createdAt,
    }).from(adminActions).orderBy(desc(adminActions.createdAt)).limit(limit);
  }

  // ----- ayudas -----

  private async target(id: string) {
    const [row] = await this.db.select().from(profiles).where(eq(profiles.id, id));
    if (!row) throw new NotFoundException('No encontramos esa cuenta');
    return row;
  }

  /** La cuenta, si quien actúa puede moderarla: no es la propia y tiene menos permisos. */
  private async moderatable(actor: AuthUser, id: string, verb: string) {
    const target = await this.target(id);
    if (target.id === actor.id) throw new ForbiddenException(`No puedes ${verb} tu propia cuenta desde aquí`);
    if (rank(target.role) >= rank(actor.role)) throw new ForbiddenException(`Solo puedes ${verb} cuentas con menos permisos que la tuya`);
    return target;
  }

  private async story(slug: string) {
    const [row] = await this.db.select().from(stories).where(eq(stories.slug, slug));
    if (!row) throw new NotFoundException('No encontramos esa historia');
    return row;
  }

  private async userView(id: string) {
    const [user] = await this.users(eq(profiles.id, id), 1, 0);
    return user;
  }

  private async record(tx: Tx, actor: AuthUser, action: string, targetKind: 'perfil' | 'historia', target: string, targetLabel: string, detail: string | null) {
    const [me] = await tx.select({ handle: profiles.handle }).from(profiles).where(eq(profiles.id, actor.id));
    await tx.insert(adminActions).values({
      actorId: me ? actor.id : null, actorHandle: me ? `@${me.handle}` : (actor.email ?? actor.id),
      action, targetKind, target, targetLabel, detail,
    });
  }
}
