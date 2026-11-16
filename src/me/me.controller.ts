import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Inject, Patch, Put, UploadedFile, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { ImageKind } from '../storage/images.js';
import { need, upload, type UploadedImage } from '../storage/upload.js';
import { AccountsService } from './accounts.service.js';
import { MeService } from './me.service.js';
import { updateProfileSchema, type ProfilePatch } from './profile.schemas.js';

const confirmSchema = z.object({ confirm: z.string().max(40) });

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

  /**
   * Borra tu cuenta para siempre. Hay que confirmar escribiendo tu nombre de usuario, para que
   * un clic suelto no se lleve todo.
   */
  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Body(new ZodPipe(confirmSchema)) body: z.infer<typeof confirmSchema>) {
    const profile = await this.me.getOrCreate(user);
    if (body.confirm.trim().replace(/^@/, '').toLowerCase() !== profile.handle) {
      throw new BadRequestException({ message: 'Datos inválidos', errors: [{ campo: 'confirm', error: 'Escribe tu nombre de usuario tal como aparece' }] });
    }
    await this.accounts.delete(user.id);
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
