import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { profiles } from '../db/schema.js';

/** Perfil público de cualquier persona, por su nombre de usuario. No pide sesión. */
@Controller('profiles')
export class ProfilesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get(':handle')
  async get(@Param('handle') handle: string) {
    const [found] = await this.db
      .select({ handle: profiles.handle, name: profiles.name, bio: profiles.bio })
      .from(profiles)
      .where(eq(profiles.handle, handle));
    if (!found) throw new NotFoundException('No encontramos ese perfil');
    return found;
  }
}
