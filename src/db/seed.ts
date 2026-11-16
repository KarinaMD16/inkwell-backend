/**
 * Datos de muestra: las mismas historias que usa el frontend, para poder conectar
 * las pantallas a la API desde el primer día. Se puede correr varias veces sin duplicar.
 *   npm run db:seed
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import * as schema from './schema.js';
import { saveTags } from '../stories/tagging.js';
import { chapters, profiles, stories, type Block } from './schema.js';

try {
  process.loadEnvFile('.env');
} catch {
  /* sin .env */
}

const INK = '#14152B';
const PAPER = '#FFFBF8';
type Seed = [title: string, slug: string, author: string, color: string, ink: string, art: string, genre: string, tropes: string[], tagline: string, extra?: Partial<typeof stories.$inferInsert>];

const DATA: Seed[] = [
  ['Cartas a la marea', 'cartas-a-la-marea', 'lunadesal', '#0F8B80', PAPER, 'wave', 'Romance', ['Slow burn', 'Cartas'], 'Una botella, una dirección equivocada y un verano que no termina.'],
  ['Grupo: los de siempre', 'grupo-los-de-siempre', 'maru.escribe', '#F6C453', INK, 'chat', 'Amistad', ['Found family', 'Humor'], 'Seis amigos, un chat y demasiados audios de cuatro minutos.', { format: 'Redes sociales', rating: 'Todo público' }],
  ['El último tren a Cartago', 'el-ultimo-tren-a-cartago', 'nicoyano', INK, PAPER, 'moon', 'Misterio', ['Pueblo pequeño'], 'El tren dejó de pasar en 1995. Anoche alguien lo escuchó.', { warnings: ['Violencia'], rating: '+16' }],
  ['Mi rival de la orquesta', 'mi-rival-de-la-orquesta', 'sol.en.do', '#DD5D4F', INK, 'sun', 'Romance', ['Enemies to lovers', 'Slow burn', 'Música'], 'Dos violines, un solo atril y un concierto que ninguno piensa perder.', { relation: 'Irene / Dani', warnings: ['Lenguaje fuerte'] }],
  ['Dragones de papel', 'dragones-de-papel', 'tinta.y.te', '#B9A5F0', INK, 'dots', 'Fantasía', ['Aventura', 'Magia'], 'Todo lo que Mei dibuja despierta. El problema es que no sabe dibujar puertas.'],
  ['Nadie duerme en el 4B', 'nadie-duerme-en-el-4b', 'valemora', '#FF8FAB', INK, 'stripes', 'Terror', ['Comedia', 'Fantasmas'], 'Alquiler barato, vecinos amables y un inquilino que murió en 1989.', { status: 'Completa', format: 'Con fichas' }],
  ['Órbita baja', 'orbita-baja', 'kepler_22', '#2EC4B6', INK, 'sun', 'Ciencia ficción', ['Espacio', 'Amistad'], 'La estación tiene aire para seis meses y siete tripulantes.'],
  ['Café para dos, sin azúcar', 'cafe-para-dos-sin-azucar', 'andre.lee', '#FFD9A8', INK, 'dots', 'Romance', ['Slow burn', 'Enemies to lovers'], 'Ella odia el café. Él tiene la única cafetería abierta a las cinco de la mañana.', { rating: 'Todo público' }],
  ['La liga de los suplentes', 'la-liga-de-los-suplentes', 'diez.y.medio', '#F28C38', INK, 'stripes', 'Deportes', ['Found family', 'Fútbol'], 'Nunca los ponen a jugar. Por eso tienen tiempo para todo lo demás.', { fandom: 'Fútbol' }],
  ['Manual para fantasmas novatos', 'manual-para-fantasmas-novatos', 'ecto.plasma', '#D7F0EC', INK, 'moon', 'Humor', ['Fantasmas', 'Comedia'], 'Capítulo uno: atravesar paredes sin perder la dignidad.', { status: 'Completa', rating: 'Todo público' }],
  ['Lo que dijo el coro', 'lo-que-dijo-el-coro', 'estrofa.b', '#4B3B8F', PAPER, 'wave', 'Romance', ['Música', 'AU'], 'Un grupo, una gira y una canción que nadie admite haber escrito.', { fandom: 'Música', warnings: ['Muerte de personaje'], rating: '+16' }],
  ['Instrucciones para volver', 'instrucciones-para-volver', 'marea.baja', '#1F3A5F', PAPER, 'chat', 'Drama', ['Familia', 'Segundas oportunidades'], 'Diez años fuera, una casa por vender y una hermana que no contesta.'],
];

const SAMPLE: Block[] = [
  { type: 'p', text: 'El ensayo terminó veinte minutos tarde y nadie dijo nada, porque la directora había sonreído dos veces y eso, en esa sala, contaba como milagro.' },
  { type: 'p', text: 'Irene guardó el violín despacio. A su lado, Dani ya tenía el estuche al hombro y silbaba el segundo movimiento, el mismo en el que ella había entrado medio compás antes.' },
  { type: 'chat', title: 'Cuerdas (sin Dani) · 5 participantes', messages: [{ who: 'Lau', text: '¿Alguien más escuchó ESE silbido?' }, { who: 'Irene', text: 'Fue medio compás. MEDIO.', me: true }] },
  { type: 'p', text: 'Mañana llegaría media hora antes. No para practicar la entrada, claro. Solo porque sí.' },
];

const env = loadEnv();
const client = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

let created = 0;
for (const [title, slug, author, color, ink, art, genre, tropes, tagline, extra] of DATA) {
  await db.insert(profiles).values({ id: randomUUID(), handle: author, name: author }).onConflictDoNothing({ target: profiles.handle });
  const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.handle, author));
  const [story] = await db
    .insert(stories)
    .values({ title, slug, authorId: profile.id, color, ink, art, genre, tropes, tagline, synopsis: tagline, published: true, kind: extra?.fandom ? 'Fanfic' : 'Original', ...extra })
    .onConflictDoNothing({ target: stories.slug })
    .returning();
  if (!story) continue; // ya existía
  created++;
  // Llena el catálogo de etiquetas y el texto de búsqueda.
  await db.transaction((tx) => saveTags(tx, story.id, story));
  await db.insert(chapters).values(
    [1, 2, 3].map((n) => ({ storyId: story.id, n, title: `Capítulo ${n}`, content: SAMPLE, publishedAt: new Date() })),
  );
}
console.log(`Listo: ${created} historias nuevas (${DATA.length - created} ya existían).`);
await client.end();
