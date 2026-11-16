import { sql } from 'drizzle-orm';
import {
  boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

/**
 * Esquema de Inkwell. Todas las tablas tienen RLS activado y ninguna política:
 * la API de datos de Supabase (PostgREST) no puede leer ni escribir nada, y todo
 * pasa por esta API, que se conecta directo a Postgres.
 */

/** Bloques de un capítulo: mismo formato que usa el frontend, pensado para TipTap. */
/** Formato dentro de un párrafo: [inicio, fin, negrita | cursiva | subrayado], contando caracteres de `text`. */
export type Mark = [start: number, end: number, kind: 'b' | 'i' | 'u'];
export type Align = 'left' | 'center' | 'right' | 'justify';

/**
 * El párrafo guarda su texto plano en `text` (sobre eso se cuenta y se busca) y el formato aparte,
 * en `marks` y `align`. Un párrafo sin formato es solo { type, text }.
 */
export type Block =
  | { type: 'p'; text: string; align?: Align; marks?: Mark[] }
  | { type: 'chat'; title: string; messages: { who: string; text: string; me?: boolean }[] }
  | { type: 'post'; author: string; text: string }
  | { type: 'ficha'; name: string; tags: string[]; text: string }
  | { type: 'interludio'; text: string };

/** Tipografía y adorno del título de un capítulo. El título se guarda como texto normal. */
export type TitleStyle = { face: 'redonda' | 'novela' | 'maquina'; ornament: 'ninguno' | 'sparkle' | 'heart' | 'moon' };

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/**
 * Perfil de cada persona. El id es el mismo del usuario en Supabase Auth (auth.users.id):
 * así la cuenta y el perfil quedan unidos. El correo y la contraseña no se copian aquí; los
 * guarda Supabase Auth y la API los lee del token de sesión.
 *
 * Públicos: handle, name, bio, link, avatarUrl, bannerUrl, createdAt.
 * Privado (solo GET /me): birthdate.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  handle: text('handle').notNull().unique(),
  name: text('name').notNull(),
  bio: text('bio').notNull().default(''),
  /** Un enlace externo (Instagram, Ko-fi, un sitio…). Siempre https. */
  link: text('link'),
  /** URLs públicas de las imágenes ya procesadas (webp) en el almacenamiento de archivos. */
  avatarUrl: text('avatar_url'),
  bannerUrl: text('banner_url'),
  /** Para la clasificación por edad. Nunca se muestra en el perfil público. */
  birthdate: date('birthdate'),
  createdAt,
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

const textArray = (name: string) => text(name).array().notNull().default(sql`'{}'::text[]`);

/**
 * Una historia. Las etiquetas viven en dos sitios a propósito:
 * - aquí, como texto y listas (genre, fandom, tropes…): es lo que se muestra, y las listas
 *   de historias se leen sin ningún join;
 * - en `tags` + `story_tags`: es por donde se busca y se filtra (incluir, excluir, autocompletar).
 * Las dos copias se escriben juntas, en una transacción, en stories/tagging.ts. Nada más las toca.
 */
export const stories = pgTable('stories', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  authorId: uuid('author_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  tagline: text('tagline').notNull().default(''),
  synopsis: text('synopsis').notNull().default(''),
  coverUrl: text('cover_url'),
  /** Color de portada generada y de lomo. */
  color: text('color').notNull().default('#0F8B80'),
  ink: text('ink').notNull().default('#FFFBF8'),
  art: text('art').notNull().default('sun'),
  /** Original, Fanfic, Poesía o No ficción. Solo un fanfic lleva fandom. */
  kind: text('kind').notNull().default('Original'),
  /** Género principal: el que se ve en la tarjeta. */
  genre: text('genre').notNull(),
  subgenres: textArray('subgenres'),
  fandom: text('fandom').notNull().default('Original'),
  relation: text('relation'),
  characters: textArray('characters'),
  tropes: textArray('tropes'),
  warnings: textArray('warnings'),
  /** Etiquetas libres, las que no caben en las otras categorías. */
  freeTags: textArray('free_tags'),
  rating: text('rating').notNull().default('+13'),
  status: text('status').notNull().default('En curso'),
  format: text('format').notNull().default('Narrativa'),
  license: text('license').notNull().default('Todos los derechos reservados'),
  language: text('language').notNull().default('es'),
  reads: integer('reads').notNull().default(0),
  /** La autora quiere que se vea. Aun así solo aparece si tiene al menos un capítulo publicado. */
  published: boolean('published').notNull().default(false),
  /** Título, frase gancho y etiquetas en minúsculas y sin tildes: sobre esto corre la búsqueda. */
  searchText: text('search_text').notNull().default(''),
  createdAt,
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('stories_author').on(t.authorId),
  index('stories_search').using('gin', sql`to_tsvector('simple', ${t.searchText})`),
]).enableRLS();

export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  /** Posición dentro de la historia, contando borradores. Quien lee ve otra numeración: solo lo publicado. */
  n: integer('n').notNull(),
  title: text('title').notNull(),
  titleStyle: jsonb('title_style').$type<TitleStyle>(),
  /** Etiqueta de plantilla que se muestra en el índice: Chat, Fichas, Interludio. */
  badge: text('badge'),
  content: jsonb('content').$type<Block[]>().notNull().default(sql`'[]'::jsonb`),
  words: integer('words').notNull().default(0),
  /** null = borrador. Una fecha futura = programado. */
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt,
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('chapters_story_n').on(t.storyId, t.n)]).enableRLS();

/** Categorías de etiqueta. Cada una es una faceta distinta del buscador. */
export const TAG_KINDS = ['genero', 'fandom', 'personaje', 'relacion', 'tropo', 'advertencia', 'libre'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/**
 * Catálogo de etiquetas. Nace sola cuando alguien la usa por primera vez. `slug` es el nombre
 * sin tildes ni mayúsculas: "Slow burn", "slow-burn" y "SLOW BURN" son la misma etiqueta, y
 * `name` es como la escribió la primera persona.
 */
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  kind: text('kind').$type<TagKind>().notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  /** Historias visibles que la usan. Ordena el autocompletado y evita contar en cada consulta. */
  uses: integer('uses').notNull().default(0),
  createdAt,
}, (t) => [
  uniqueIndex('tags_kind_slug').on(t.kind, t.slug),
  // Autocompletar por prefijo: "slow" encuentra "slow-burn".
  index('tags_slug_prefix').on(t.slug.op('text_pattern_ops')),
]).enableRLS();

export const storyTags = pgTable('story_tags', {
  storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.storyId, t.tagId] }),
  // "Historias con esta etiqueta": el camino de los filtros de incluir y excluir.
  index('story_tags_tag').on(t.tagId, t.storyId),
]).enableRLS();

/** La repisa de cada persona: historia guardada y capítulo por el que va. */
export const library = pgTable('library', {
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  chapter: integer('chapter').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.storyId] })]).enableRLS();

export const votes = pgTable('votes', {
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  createdAt,
}, (t) => [primaryKey({ columns: [t.userId, t.chapterId] })]).enableRLS();
