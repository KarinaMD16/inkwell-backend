/**
 * Quita los datos de muestra que dejó el antiguo `db:seed`: perfiles que no tienen cuenta
 * en Supabase Auth (el seed los creaba con un id inventado) y, en cascada, sus historias,
 * capítulos, votos y repisas. Las cuentas reales no se tocan.
 *
 *   npm run db:limpiar-muestra            → solo muestra qué se borraría
 *   npm run db:limpiar-muestra -- --borrar → lo borra (en una transacción)
 */
import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import { recount, tagIdsOf } from '../stories/tagging.js';
import * as schema from './schema.js';
import { profiles, stories } from './schema.js';

try {
  process.loadEnvFile('.env');
} catch {
  /* sin .env */
}

const borrar = process.argv.includes('--borrar');
const env = loadEnv();
const client = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

try {
  const huerfanos = await db
    .select({ id: profiles.id, handle: profiles.handle })
    .from(profiles)
    .where(sql`not exists (select 1 from auth.users u where u.id = ${profiles.id})`);

  if (!huerfanos.length) {
    console.log('No hay datos de muestra: todos los perfiles tienen una cuenta real.');
  } else {
    const ids = huerfanos.map((p) => p.id);
    const suyas = await db.select({ id: stories.id, title: stories.title }).from(stories).where(inArray(stories.authorId, ids));
    console.log(`Perfiles de muestra (${huerfanos.length}): ${huerfanos.map((p) => `@${p.handle}`).join(', ')}`);
    console.log(`Historias de muestra (${suyas.length}): ${suyas.map((s) => s.title).join(' · ') || 'ninguna'}`);

    if (!borrar) {
      console.log('\nNo se borró nada. Para borrarlo: npm run db:limpiar-muestra -- --borrar');
    } else {
      await db.transaction(async (tx) => {
        const usadas = new Set<string>();
        for (const s of suyas) for (const t of await tagIdsOf(tx, s.id)) usadas.add(t);
        // Borrar el perfil borra en cascada sus historias, capítulos, votos y repisa.
        await tx.delete(profiles).where(inArray(profiles.id, ids));
        await recount(tx, [...usadas]);
      });
      console.log('\nListo: se borraron los datos de muestra.');
    }
  }
} finally {
  await client.end();
}
