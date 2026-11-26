import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { follows, profiles } from '../db/schema.js';

export interface FollowState {
  /** Cuántas personas siguen a este perfil. */
  followers: number;
  /** A cuántas personas sigue este perfil. */
  following: number;
  /** Si quien pregunta lo sigue; null sin sesión o si es su propio perfil. */
  isFollowing: boolean | null;
}

/**
 * Seguir autores. Seguir y dejar de seguir son idempotentes: repetirlos deja lo mismo.
 * Punto de contacto (Orlando): cuando existan los bloqueos entre cuentas, `follow` debe preguntar
 * a su regla "puede interactuar" y responder 404 si alguna de las dos bloqueó a la otra.
 */
@Injectable()
export class FollowsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Los números del perfil y, con sesión, si ya lo sigues. */
  async state(handle: string, viewerId: string | null): Promise<FollowState> {
    const target = await this.profileOf(handle);
    const [[{ followers }], [{ following }], mine] = await Promise.all([
      this.db.select({ followers: count() }).from(follows).where(eq(follows.followedId, target)),
      this.db.select({ following: count() }).from(follows).where(eq(follows.followerId, target)),
      viewerId && viewerId !== target
        ? this.db.select({ one: follows.followerId }).from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followedId, target)))
        : Promise.resolve(null),
    ]);
    return { followers, following, isFollowing: mine === null ? null : mine.length > 0 };
  }

  async follow(viewerId: string, handle: string): Promise<FollowState> {
    const target = await this.profileOf(handle);
    if (target === viewerId) throw new BadRequestException('No puedes seguir tu propio perfil');
    await this.db.insert(follows).values({ followerId: viewerId, followedId: target }).onConflictDoNothing();
    return this.state(handle, viewerId);
  }

  async unfollow(viewerId: string, handle: string): Promise<FollowState> {
    const target = await this.profileOf(handle);
    await this.db.delete(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followedId, target)));
    return this.state(handle, viewerId);
  }

  /** El id del perfil; un perfil suspendido no se ve, así que tampoco se puede seguir (404). */
  private async profileOf(handle: string): Promise<string> {
    const [found] = await this.db.select({ id: profiles.id }).from(profiles)
      .where(and(eq(profiles.handle, handle), isNull(profiles.suspendedAt)));
    if (!found) throw new NotFoundException('No encontramos ese perfil');
    return found.id;
  }
}
