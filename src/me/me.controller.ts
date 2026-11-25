import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Patch, Put, UploadedFile, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { ImageKind } from '../storage/images.js';
import { need, upload, type UploadedImage } from '../storage/upload.js';
import { AccountsService } from './accounts.service.js';
import { MeService } from './me.service.js';
import { updateProfileSchema, type ProfilePatch } from './profile.schemas.js';

/** Cambios de cuenta y subidas: pocos por minuto bastan para una persona y frenan a un bot. */
const SENSITIVE = { default: { limit: 20, ttl: 60_000 } };

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    @Inject(MeService) private readonly me: MeService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
  ) {}

  /** Tu perfil completo, con el correo de tu cuenta y tu fecha de nacimiento (privados). */
  @Get()
  async get(@CurrentUser() user: AuthUser) {
    return this.me.view(await this.me.getOrCreate(user), user);
  }

  /** Una copia de todos tus datos en JSON: perfil, historias con sus capítulos, repisa y votos. */
  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="inkwell-mis-datos.json"')
  async export(@CurrentUser() user: AuthUser) {
    await this.me.getOrCreate(user);
    return this.accounts.export(user);
  }

  @Patch()
  @Throttle(SENSITIVE)
  async update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(updateProfileSchema)) body: ProfilePatch) {
    return this.me.view(await this.me.update(user, body), user);
  }

  // Fotos: multipart/form-data con el archivo en el campo "file".
  @Put('avatar')
  @Throttle(SENSITIVE)
  @upload()
  async setAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file?: UploadedImage) {
    return this.image(user, 'avatar', file);
  }

  @Put('banner')
  @Throttle(SENSITIVE)
  @upload()
  async setBanner(@CurrentUser() user: AuthUser, @UploadedFile() file?: UploadedImage) {
    return this.image(user, 'banner', file);
  }

  /** Elimina tu cuenta y todo lo tuyo. Pide haberte identificado hace menos de 10 minutos. */
  @Delete()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  async remove(@CurrentUser() user: AuthUser) {
    await this.me.deleteAccount(user);
  }

  @Delete('avatar')
  async removeAvatar(@CurrentUser() user: AuthUser) {
    return this.me.view(await this.me.removeImage(user, 'avatar'), user);
  }

  @Delete('banner')
  async removeBanner(@CurrentUser() user: AuthUser) {
    return this.me.view(await this.me.removeImage(user, 'banner'), user);
  }

  private async image(user: AuthUser, kind: ImageKind, file?: UploadedImage) {
    return this.me.view(await this.me.setImage(user, kind, need(file)), user);
  }
}
