import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService } from './me.service.js';

const updateSchema = z.object({
  handle: z.string().min(3).max(24).regex(/^[a-z0-9._]+$/, 'solo minúsculas, números, punto y guion bajo').optional(),
  name: z.string().min(1).max(60).optional(),
  bio: z.string().max(300).optional(),
});

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(@Inject(MeService) private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.me.getOrCreate(user);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(updateSchema)) body: z.infer<typeof updateSchema>) {
    return this.me.update(user, body);
  }
}
