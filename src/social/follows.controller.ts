import { Controller, Delete, Get, Header, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard, CurrentUser, CurrentViewer, OptionalAuth } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { MeService } from '../me/me.service.js';
import type { Viewer } from '../visibility/visibility.js';
import { FollowsService } from './follows.service.js';

/** Seguir y dejar de seguir: de sobra para una persona y frena a un bot que siga a miles (regla 8). */
const FOLLOW_LIMIT = { default: { limit: 30, ttl: 60_000 } };

/** Seguidores de un perfil. Los números se ven sin cuenta; seguir pide sesión. */
@Controller('profiles/:handle/follow')
@UseGuards(AuthGuard)
export class FollowsController {
  constructor(
    @Inject(FollowsService) private readonly follows: FollowsService,
    @Inject(MeService) private readonly me: MeService,
  ) {}

  /** Seguidores, seguidos y si ya lo sigues. Sin caché: cambia con cada seguidor y depende de quién pregunta. */
  @Get()
  @OptionalAuth()
  @Header('Cache-Control', 'no-store')
  state(@Param('handle') handle: string, @CurrentViewer() viewer: Viewer | null) {
    return this.follows.state(handle, viewer?.id ?? null);
  }

  @Put()
  @Throttle(FOLLOW_LIMIT)
  async follow(@CurrentUser() user: AuthUser, @Param('handle') handle: string) {
    await this.me.getOrCreate(user);
    return this.follows.follow(user.id, handle);
  }

  @Delete()
  @Throttle(FOLLOW_LIMIT)
  unfollow(@CurrentUser() user: AuthUser, @Param('handle') handle: string) {
    return this.follows.unfollow(user.id, handle);
  }
}
