import { sql } from 'drizzle-orm';
import {
  boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

/**
 * Esquema de Inkwell. Todas las tablas tienen RLS activado y ninguna política:
 * la API de datos de Supabase (PostgREST) no puede leer ni escribir nada, y todo
 * pasa por esta API, que se conecta directo a Postgres.
 */

/** Bloques de un capítulo: mismo formato que usa el frontend, pensado para TipTap. */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'chat'; title: string; messages: { who: string; text: string; me?: boolean }[] }
  | { type: 'post'; author: string; text: string }
  | { type: 'ficha'; name: string; tags: string[]; text: string }
  | { type: 'interludio'; text: string };

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Perfil público. El id es el mismo del usuario en Supabase Auth (auth.users.id). */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  handle: text('handle').notNull().unique(),
  name: text('name').notNull(),
  bio: text('bio').notNull().default(''),
  createdAt,
}).enableRLS();

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
  genre: text('genre').notNull(),
  fandom: text('fandom').notNull().default('Original'),
  relation: text('relation'),
  tropes: text('tropes').array().notNull().default(sql`'{}'::text[]`),
  warnings: text('warnings').array().notNull().default(sql`'{}'::text[]`),
  rating: text('rating').notNull().default('+13'),
  status: text('status').notNull().default('En curso'),
  format: text('format').notNull().default('Narrativa'),
  reads: integer('reads').notNull().default(0),
  published: boolean('published').notNull().default(false),
  createdAt,
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  n: integer('n').notNull(),
  title: text('title').notNull(),
  /** Etiqueta de plantilla que se muestra en el índice: Chat, Fichas, Interludio. */
  badge: text('badge'),
  content: jsonb('content').$type<Block[]>().notNull().default(sql`'[]'::jsonb`),
  /** null = borrador. Una fecha futura = programado. */
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt,
}, (t) => [uniqueIndex('chapters_story_n').on(t.storyId, t.n)]).enableRLS();

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
