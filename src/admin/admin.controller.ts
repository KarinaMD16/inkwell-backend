import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { z } from 'zod';
import { AuthGuard, CurrentUser, MinRole } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  actionsQuerySchema, reasonSchema, roleSchema, storiesQuerySchema, usersQuerySchema, type StoriesQuery, type UsersQuery,
} from './admin.schemas.js';
import { AdminService } from './admin.service.js';

const Id = () => Param('id', new ParseUUIDPipe());
type Reason = z.infer<typeof reasonSchema>;

/**
 * Panel de moderación y administración. Todo pide al menos rol moderador; cambiar roles y
 * borrar cuentas pide admin. Las reglas finas (a quién se puede moderar) están en AdminService.
 */
@Controller('admin')
@UseGuards(AuthGuard)
@MinRole('moderador')
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('users')
  users(@Query(new ZodPipe(usersQuerySchema)) query: UsersQuery) {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id/role')
  @MinRole('admin')
  setRole(@CurrentUser() user: AuthUser, @Id() id: string, @Body(new ZodPipe(roleSchema)) body: z.infer<typeof roleSchema>) {
    return this.admin.setRole(user, id, body.role);
  }

  @Post('users/:id/suspend')
  suspend(@CurrentUser() user: AuthUser, @Id() id: string, @Body(new ZodPipe(reasonSchema)) body: Reason) {
    return this.admin.suspend(user, id, body.reason);
  }

  @Post('users/:id/unsuspend')
  unsuspend(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.admin.unsuspend(user, id);
  }

  @Delete('users/:id')
  @MinRole('admin')
  @HttpCode(204)
  async deleteUser(@CurrentUser() user: AuthUser, @Id() id: string) {
    await this.admin.deleteUser(user, id);
  }

  @Get('stories')
  stories(@Query(new ZodPipe(storiesQuerySchema)) query: StoriesQuery) {
    return this.admin.listStories(query);
  }

  @Post('stories/:slug/remove')
  remove(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body(new ZodPipe(reasonSchema)) body: Reason) {
    return this.admin.removeStory(user, slug, body.reason);
  }

  @Post('stories/:slug/restore')
  restore(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.restoreStory(user, slug);
  }

  @Get('actions')
  actions(@Query(new ZodPipe(actionsQuerySchema)) query: z.infer<typeof actionsQuerySchema>) {
    return this.admin.actions(query.limit);
  }
}
