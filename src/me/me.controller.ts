import { Body, Controller, Delete, Get, Inject, Patch, Put, UploadedFile, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { ImageKind } from '../storage/images.js';
import { need, upload, type UploadedImage } from '../storage/upload.js';
import { MeService } from './me.service.js';
import { updateProfileSchema, type ProfilePatch } from './profile.schemas.js';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(@Inject(MeService) private readonly me: MeService) {}

  /** Tu perfil completo, con el correo de tu cuenta y tu fecha de nacimiento (privados). */
  @Get()
  async get(@CurrentUser() user: AuthUser) {
    return this.me.view(await this.me.getOrCreate(user), user);
  }

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(updateProfileSchema)) body: ProfilePatch) {
    return this.me.view(await this.me.update(user, body), user);
  }

  // Fotos: multipart/form-data con el archivo en el campo "file".
  @Put('avatar')
  @upload()
  async setAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file?: UploadedImage) {
    return this.image(user, 'avatar', file);
  }

  @Put('banner')
  @upload()
  async setBanner(@CurrentUser() user: AuthUser, @UploadedFile() file?: UploadedImage) {
    return this.image(user, 'banner', file);
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
