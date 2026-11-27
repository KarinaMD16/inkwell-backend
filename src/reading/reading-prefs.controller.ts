import { Body, Controller, Get, Header, Inject, Put, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService } from '../me/me.service.js';
import { readingPrefsSchema, ReadingPrefsService, type ReadingPrefs } from './reading-prefs.service.js';

/** Los ajustes "Aa" del lector, guardados en la cuenta para verlos igual en todos los dispositivos. */
@Controller('me/reading-prefs')
@UseGuards(AuthGuard)
export class ReadingPrefsController {
  constructor(
    @Inject(ReadingPrefsService) private readonly prefs: ReadingPrefsService,
    @Inject(MeService) private readonly me: MeService,
  ) {}

  /** `{ prefs: null }` si nunca guardaste nada. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async get(@CurrentUser() user: AuthUser) {
    return { prefs: await this.prefs.get(user.id) };
  }

  @Put()
  async save(@CurrentUser() user: AuthUser, @Body(new ZodPipe(readingPrefsSchema)) body: ReadingPrefs) {
    await this.me.getOrCreate(user);
    return { prefs: await this.prefs.save(user.id, body) };
  }
}
