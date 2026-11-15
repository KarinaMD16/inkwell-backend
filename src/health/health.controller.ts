import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Para comprobar que la API está viva y llega a la base. Render lo usa como health check. */
  @Get()
  async check() {
    try {
      await this.db.execute(sql`select 1`);
      return { ok: true, db: true };
    } catch {
      return { ok: true, db: false };
    }
  }
}
