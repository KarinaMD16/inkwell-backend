import { z } from 'zod';
import { TAG_KINDS } from '../db/schema.js';
import { KINDS, RATINGS, STATUSES } from '../stories/stories.schemas.js';

export const FORMATS = ['Narrativa', 'Redes sociales', 'Con fichas'] as const;
/** Extensión por capítulos publicados, igual que lengthOf() del frontend: corta < 15, media hasta 30, larga más. */
export const LENGTHS = ['corta', 'media', 'larga'] as const;
export const SORTS = ['relevancia', 'populares', 'votos', 'recientes', 'lecturas'] as const;

/** Lista separada por comas en la URL: "slow-burn, Found family" -> ["slow-burn", "Found family"]. */
const csv = z.string().max(400).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.string().max(60)).max(10));
const csvOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.string().max(400).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.enum(values)).max(values.length));

/**
 * Búsqueda y filtros de Explorar. En los filtros de una sola opción por historia (género, fandom,
 * clasificación, estado, formato, extensión) varios valores significan "cualquiera de estos";
 * `tags` pide todas y `exclude`, ninguna.
 */
export const listSchema = z.object({
  /** Texto libre: título, frase, etiquetas y @autora, sin tildes y por prefijo. */
  q: z.string().trim().max(80).optional(),
  genre: csv.optional(),
  /** Slugs de fandom. */
  fandom: csv.optional(),
  kind: z.enum(KINDS).optional(),
  rating: csvOf(RATINGS).optional(),
  status: csvOf(STATUSES).optional(),
  format: csvOf(FORMATS).optional(),
  length: csvOf(LENGTHS).optional(),
  /** Con un capítulo nuevo en la última semana o el último mes. */
  updated: z.enum(['semana', 'mes']).optional(),
  author: z.string().max(24).optional(),
  /** Etiquetas que la historia debe tener (todas), de cualquier categoría. */
  tags: csv.optional(),
  /** Etiquetas que la historia no puede tener (ninguna). */
  exclude: csv.optional(),
  /** `relevancia` necesita `q`; sin texto ordena por votos. `populares`: votos de los últimos 30 días. */
  sort: z.enum(SORTS).default('recientes'),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
}).strict();
export type ListQuery = z.infer<typeof listSchema>;

/** Secciones de una etiqueta: lo nuevo y lo popular. */
export const sectionsSchema = z.object({
  tag: z.string().trim().min(1).max(60),
  limit: z.coerce.number().int().min(1).max(12).default(6),
}).strict();
export type SectionsQuery = z.infer<typeof sectionsSchema>;

/** Bloquear una etiqueta: por su categoría y su slug, tal como las devuelve GET /tags. */
export const blockTagSchema = z.object({
  kind: z.enum(TAG_KINDS),
  slug: z.string().trim().min(1).max(60),
}).strict();
export type BlockTag = z.infer<typeof blockTagSchema>;

/** Autocompletar etiquetas. Sin `kind`, de todas las categorías menos género (lista fija). */
export const tagSearchSchema = z.object({
  q: z.string().trim().max(60).default(''),
  kind: z.enum(['fandom', 'personaje', 'relacion', 'tropo', 'advertencia', 'libre']).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
export type TagSearch = z.infer<typeof tagSearchSchema>;
