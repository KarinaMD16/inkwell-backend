import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV, loadEnv, type Env } from '../config/env.js';
import * as schema from './schema.js';

/** Tipo común a cualquier driver de Postgres, para poder cambiarlo en las pruebas. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export const DB = Symbol('DB');
const CLIENT = Symbol('PG_CLIENT');

@Injectable()
class DbShutdown implements OnApplicationShutdown {
  constructor(@Inject(CLIENT) private readonly client: postgres.Sql | null) {}
  async onApplicationShutdown() {
    await this.client?.end({ timeout: 5 });
  }
}

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: CLIENT,
      inject: [ENV],
      // prepare:false permite usar también el pooler en modo transacción de Supabase.
      useFactory: (env: Env) => postgres(env.DATABASE_URL, { prepare: false, max: 5, idle_timeout: 20 }),
    },
    { provide: DB, inject: [CLIENT], useFactory: (client: postgres.Sql): Db => drizzle(client, { schema }) },
    DbShutdown,
  ],
  exports: [DB, ENV],
})
export class DbModule {}
