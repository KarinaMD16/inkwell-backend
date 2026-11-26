import { Body, Controller, Get, Header, Inject, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService } from '../me/me.service.js';
import { NotificationsService, notificationPrefsSchema, type NotificationPrefs } from './notifications.service.js';

/** Novedades de quien entró y sus interruptores de Ajustes. Todo pide sesión y nada se cachea. */
@Controller('me')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(MeService) private readonly me: MeService,
  ) {}

  @Get('notifications')
  @Header('Cache-Control', 'no-store')
  feed(@CurrentUser() user: AuthUser) {
    return this.notifications.feed(user);
  }

  /** Solo cuántos avisos sin leer hay: para el puntito de la campana. */
  @Get('notifications/unread')
  @Header('Cache-Control', 'no-store')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unread(user);
  }

  @Post('notifications/read')
  async markRead(@CurrentUser() user: AuthUser) {
    await this.me.getOrCreate(user);
    return this.notifications.markRead(user.id);
  }

  @Get('notification-prefs')
  @Header('Cache-Control', 'no-store')
  async prefs(@CurrentUser() user: AuthUser) {
    const { chapters, replies, followers } = await this.notifications.prefs(user.id);
    return { chapters, replies, followers };
  }

  @Put('notification-prefs')
  async savePrefs(@CurrentUser() user: AuthUser, @Body(new ZodPipe(notificationPrefsSchema)) body: NotificationPrefs) {
    await this.me.getOrCreate(user);
    return this.notifications.savePrefs(user.id, body);
  }
}
