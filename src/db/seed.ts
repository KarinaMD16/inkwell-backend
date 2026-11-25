/**
 * Datos de ejemplo para probar Inkwell de punta a punta con algo que parezca uso real:
 * 8 personas de 15 a 31 años (una moderadora), 13 historias de varios géneros y
 * clasificaciones, capítulos con plantillas, borradores, uno programado, votos y repisas.
 *
 *   npm run db:seed                      → borra la semilla anterior y la vuelve a crear
 *   npm run db:seed -- --borrar          → solo la borra
 *   npm run db:seed -- --entrar <@usuario> → enlace de un solo uso para entrar (solo en local)
 *
 * Es idempotente: correrlo dos veces deja lo mismo. Solo toca cuentas de la semilla
 * (correo semilla.<usuario>@example.com y user_metadata.semilla = true); las reales no se tocan.
 * Las cuentas se crean en Supabase Auth con la llave secreta (SUPABASE_SERVICE_ROLE_KEY).
 * Sin SEED_PASSWORD no tienen contraseña: se entra con --entrar. Con SEED_PASSWORD, todas usan esa.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { slugify } from '../common/slug.js';
import { loadEnv } from '../config/env.js';
import { recount, saveTags } from '../stories/tagging.js';
import * as schema from './schema.js';
import { chapters, library, profiles, stories, storyTags, votes, type Block } from './schema.js';
import { PEOPLE, READINGS, STORIES } from './semilla/datos.js';

try {
  process.loadEnvFile('.env');
} catch {
  /* sin .env: se usan las variables del entorno */
}

const env = loadEnv();
const args = process.argv.slice(2);
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin`;
const emailOf = (handle: string) => `semilla.${handle}@example.com`;
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

const client = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

async function auth(path: string, body: object) {
  if (!SERVICE_KEY) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env: hace falta para crear las cuentas de la semilla.');
  const res = await fetch(`${ADMIN}${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'inkwell-semilla' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Supabase Auth respondió ${res.status}: ${JSON.stringify(json.msg ?? json.error_description ?? json.error ?? '')}`);
  return json;
}

/** Ids de las cuentas de la semilla que existen hoy. */
async function seedAccounts(): Promise<string[]> {
  const rows = await db.execute(sql`select id from auth.users where email like 'semilla.%@example.com' and raw_user_meta_data->>'semilla' = 'true'`);
  return [...rows].map((r) => String((r as { id: string }).id));
}

/** Borra la semilla: perfiles (en cascada historias, capítulos, votos y repisas), etiquetas recontadas y cuentas. */
async function clear() {
  const ids = await seedAccounts();
  if (!ids.length) return 0;
  await db.transaction(async (tx) => {
    const used = await tx.selectDistinct({ id: storyTags.tagId }).from(storyTags)
      .innerJoin(stories, eq(stories.id, storyTags.storyId)).where(inArray(stories.authorId, ids));
    await tx.delete(profiles).where(inArray(profiles.id, ids));
    await recount(tx, used.map((u) => u.id));
    await tx.execute(sql`delete from auth.users where id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
  });
  return ids.length;
}

/** Fecha de nacimiento para tener `age` años cumplidos hace un mes. */
function birthdate(age: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - age);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

/** Mismo conteo que el editor: palabras del texto plano, incluidos los mensajes de los chats. */
function countWords(content: Block[]): number {
  const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  return content.reduce((n, b) => n + (b.type === 'chat' ? b.messages.reduce((m, msg) => m + words(msg.text), 0) : 'text' in b ? words(b.text) : 0), 0);
}

async function create() {
  const ids = new Map<string, string>();
  for (const person of PEOPLE) {
    const user = await auth('/users', {
      email: emailOf(person.handle),
      email_confirm: true,
      ...(process.env.SEED_PASSWORD ? { password: process.env.SEED_PASSWORD } : {}),
      user_metadata: { semilla: true, handle: person.handle, birthdate: birthdate(person.age) },
    });
    const id = String(user.id);
    ids.set(person.handle, id);
    await db.insert(profiles).values({
      id, handle: person.handle, name: person.name, bio: person.bio, birthdate: birthdate(person.age),
      role: person.role ?? 'lector', showMature: person.showMature ?? false, createdAt: ago(90),
    });
  }

  const storyIds = new Map<string, { id: string; live: string[] }>();
  for (const s of STORIES) {
    const authorId = ids.get(s.author)!;
    const days = s.chapters.map((c) => c.daysAgo).filter((d): d is number => d !== null);
    const first = Math.max(...days, 1) + 2;
    const last = days.filter((d) => d >= 0).length ? Math.min(...days.filter((d) => d >= 0)) : first;
    const published = s.published ?? true;
    // El slug lo decide el título, como en la app; si ya existe (de una cuenta real), se numera.
    let slug = slugify(s.title);
    for (let i = 2; (await db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug))).length; i++) slug = `${slugify(s.title)}-${i}`;

    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(stories).values({
        slug, authorId, title: s.title, tagline: s.tagline, synopsis: s.synopsis, kind: s.kind, genre: s.genre,
        rating: s.rating, status: s.status, format: s.format ?? 'Narrativa', color: s.color, ink: s.ink, art: s.art,
        published, reads: s.reads, createdAt: ago(first), updatedAt: ago(last),
      }).returning({ id: stories.id });
      const rows = await tx.insert(chapters).values(s.chapters.map((c, i) => ({
        storyId: row.id, n: i + 1, title: c.title, badge: c.badge ?? null, content: c.content, words: countWords(c.content),
        publishedAt: c.daysAgo === null ? null : ago(c.daysAgo), createdAt: ago(c.daysAgo === null ? 1 : Math.max(c.daysAgo, 0) + 1),
        updatedAt: ago(c.daysAgo === null ? 1 : Math.max(c.daysAgo, 0)),
      }))).returning({ id: chapters.id, publishedAt: chapters.publishedAt });
      // Las etiquetas se guardan como en la app: tagging.ts (catálogo, búsqueda y conteos).
      await saveTags(tx, row.id, {
        title: s.title, tagline: s.tagline, kind: s.kind, genre: s.genre, subgenres: s.subgenres ?? [], fandom: s.fandom ?? 'Original',
        relation: s.relation ?? null, characters: s.characters ?? [], tropes: s.tropes ?? [], warnings: s.warnings ?? [], freeTags: s.tags ?? [],
      });
      const live = rows.filter((c) => c.publishedAt && c.publishedAt <= new Date()).map((c) => c.id);
      return { id: row.id, live };
    });
    storyIds.set(s.title, created);
  }

  for (const r of READINGS) {
    const userId = ids.get(r.reader)!;
    const story = storyIds.get(r.story)!;
    const lastVote = Math.min(...(r.votes ?? [[0, 1]]).map(([, d]) => d));
    await db.insert(library).values({ userId, storyId: story.id, chapter: r.at, updatedAt: ago(lastVote) });
    for (const [n, days] of r.votes ?? []) {
      const chapterId = story.live[n - 1];
      if (chapterId) await db.insert(votes).values({ userId, chapterId, createdAt: ago(days) });
    }
  }
  return { people: ids.size, stories: storyIds.size };
}

async function signInLink(handle: string) {
  if (!/^http:\/\/localhost(:\d+)?$/.test(env.CORS_ORIGINS.split(',')[0].trim())) {
    throw new Error('--entrar solo funciona en local (CORS_ORIGINS debe empezar con http://localhost).');
  }
  const link = await auth('/generate_link', { type: 'magiclink', email: emailOf(handle.replace(/^@/, '')) });
  const hash = (link.hashed_token ?? (link.properties as Record<string, unknown> | undefined)?.hashed_token) as string;
  const site = env.CORS_ORIGINS.split(',')[0].trim();
  console.log(`Abre este enlace (vale una vez, unos minutos):\n${site}/api/auth/confirmar?token_hash=${hash}&type=magiclink`);
}

try {
  if (args[0] === '--entrar') {
    if (!args[1]) throw new Error(`Falta el usuario. Opciones: ${PEOPLE.map((p) => `@${p.handle}`).join(', ')}`);
    await signInLink(args[1]);
  } else {
    const removed = await clear();
    if (removed) console.log(`Semilla anterior borrada: ${removed} cuentas.`);
    if (args[0] !== '--borrar') {
      const made = await create();
      console.log(`Semilla lista: ${made.people} personas y ${made.stories} historias.`);
      console.log(`Para entrar: npm run db:seed -- --entrar @${PEOPLE[0].handle}${process.env.SEED_PASSWORD ? ' (o con SEED_PASSWORD en /entrar)' : ''}`);
    }
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
