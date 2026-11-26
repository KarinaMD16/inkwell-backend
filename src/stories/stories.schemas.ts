import { z } from 'zod';
import { BLOCK_ID, withIds } from './block-ids.js';

// Catálogos. El frontend usa las mismas listas (src/lib/data.ts): si cambias una, cambia la otra.
export const GENRES = [
  'Romance', 'Fantasía', 'Misterio', 'Suspenso', 'Terror', 'Ciencia ficción', 'Aventura', 'Paranormal',
  'Juvenil', 'Coming of age', 'Contemporánea', 'Drama', 'Humor', 'Amistad', 'Histórica', 'Deportes', 'LGBTQ+',
] as const;
export const KINDS = ['Original', 'Fanfic', 'Poesía', 'No ficción'] as const;
/** Lo que se puede elegir como gusto en la bienvenida: los géneros y, aparte, el fanfic. */
export const INTERESTS = [...GENRES, 'Fanfic'] as const;
export const RATINGS = ['Todo público', '+13', '+16', '+18'] as const;
export const STATUSES = ['En curso', 'En pausa', 'Completa'] as const;
export const LICENSES = ['Todos los derechos reservados', 'CC BY', 'CC BY-NC', 'CC BY-NC-ND', 'Dominio público'] as const;

// La búsqueda de Explorar (GET /stories) está en discovery/discovery.schemas.ts.

/** Lista de etiquetas sin repetidas ("Slow burn" y "slow burn" cuentan como una). */
const tagList = (max: number, length = 40) =>
  z.array(z.string().trim().min(1).max(length)).max(max)
    .transform((list) => list.filter((t, i) => list.findIndex((o) => o.toLowerCase() === t.toLowerCase()) === i));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Los datos de una historia, sin valores por defecto: así sirven igual para crear y para editar. */
const story = {
  title: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(120),
  synopsis: z.string().trim().max(2000),
  kind: z.enum(KINDS),
  genre: z.enum(GENRES),
  subgenres: z.array(z.enum(GENRES)).max(2),
  fandom: z.string().trim().max(60),
  relation: z.string().trim().max(80).nullable(),
  characters: tagList(12, 60),
  tropes: tagList(12),
  warnings: tagList(12),
  tags: tagList(20),
  rating: z.enum(RATINGS),
  status: z.enum(STATUSES),
  license: z.enum(LICENSES),
  format: z.enum(['Narrativa', 'Redes sociales', 'Con fichas']),
  color: hex,
  ink: hex,
  art: z.enum(['wave', 'chat', 'moon', 'sun', 'dots', 'stripes']),
  spine: z.strictObject({
    source: z.enum(['color', 'portada', 'imagen']),
    texture: z.enum(['lisa', 'tela', 'cuero', 'lino', 'papel']),
    ornament: z.enum(['ninguno', 'bandas', 'filete', 'marco']),
  }),
  published: z.boolean(),
};

export const createStorySchema = z.object({
  ...story,
  tagline: story.tagline.default(''),
  synopsis: story.synopsis.default(''),
  kind: story.kind.default('Original'),
  subgenres: story.subgenres.default([]),
  fandom: story.fandom.default('Original'),
  relation: story.relation.optional(),
  characters: story.characters.default([]),
  tropes: story.tropes.default([]),
  warnings: story.warnings.default([]),
  tags: story.tags.default([]),
  rating: story.rating.default('+13'),
  status: story.status.default('En curso'),
  license: story.license.default('Todos los derechos reservados'),
  format: story.format.default('Narrativa'),
  color: story.color.default('#0F8B80'),
  ink: story.ink.default('#FFFBF8'),
  art: story.art.default('sun'),
  spine: story.spine.default({ source: 'color', texture: 'lisa', ornament: 'ninguno' }),
  published: story.published.default(false),
});
export type CreateStory = z.infer<typeof createStorySchema>;

/** Editar: solo llega lo que cambia. Un campo que no existe se rechaza. */
export const updateStorySchema = z.strictObject(story).partial();
export type UpdateStory = z.infer<typeof updateStorySchema>;

/**
 * Texto de un capítulo. Se guarda tal cual (símbolos, emojis, espacios), salvo lo que la base no puede
 * guardar y haría fallar todo el guardado: el carácter nulo (a veces viene al pegar desde Word) pasa a
 * ser un espacio, y una mitad suelta de un emoji (queda al cortar texto a medias) pasa a ser "�".
 * Cada reemplazo ocupa lo mismo que lo que reemplaza: así la negrita y la cursiva no se corren de lugar.
 * (La web ya los quita antes de enviar; esto es la segunda capa.)
 */
export const cleanText = (value: string) =>
  value.replace(/\u0000/g, ' ').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
const clean = (max: number) => z.string().max(max).transform(cleanText);

// Límites generosos: un capítulo largo o una historia tipo chat no deben chocar con ellos.
// El tope real es el tamaño de la petición (2 MB, ver main.ts).
const text = clean(50_000);
/** Lo pone el editor; si falta o se repite, la API da uno nuevo (ver block-ids.ts). */
const id = z.string().regex(BLOCK_ID).optional();
const block = z.discriminatedUnion('type', [
  z.object({
    id, type: z.literal('p'), text,
    align: z.enum(['left', 'center', 'right', 'justify']).optional(),
    marks: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0), z.enum(['b', 'i', 'u'])])).max(5000).optional(),
  }),
  z.object({ id, type: z.literal('chat'), title: clean(120), messages: z.array(z.object({ who: clean(40), text: clean(4000), me: z.boolean().optional() })).max(2000) }),
  z.object({ id, type: z.literal('post'), author: clean(40), text: clean(4000) }),
  z.object({ id, type: z.literal('ficha'), name: clean(80), tags: z.array(clean(40)).max(12).default([]), text: clean(10_000) }),
  z.object({ id, type: z.literal('interludio'), text }),
]);

const chapter = {
  /** Un borrador puede no tener título todavía. */
  title: z.string().trim().max(120).transform((t) => cleanText(t) || 'Sin título'),
  titleStyle: z.object({ face: z.enum(['redonda', 'novela', 'maquina']), ornament: z.enum(['ninguno', 'sparkle', 'heart', 'moon']) }).nullable(),
  badge: z.string().trim().max(20).nullable(),
  content: z.array(block).max(20_000).transform((blocks) => withIds(blocks)),
};

export const createChapterSchema = z.object({
  title: chapter.title.default('Sin título'),
  titleStyle: chapter.titleStyle.optional(),
  badge: chapter.badge.optional(),
  content: chapter.content.default([]),
  /** true publica ahora; false lo deja como borrador. */
  publish: z.boolean().default(false),
});
export type CreateChapter = z.infer<typeof createChapterSchema>;

export const updateChapterSchema = z.strictObject({
  ...chapter,
  /** La revisión sobre la que se trabajó. Si ya no es la última, la API no pisa nada y responde 409. */
  revision: z.number().int().positive(),
  /** Guardar sí o sí una copia de lo que se reemplaza (al elegir "quedarme con la mía" en un conflicto). */
  keepVersion: z.boolean(),
}).partial();
export type UpdateChapter = z.infer<typeof updateChapterSchema>;

/** Sin `at` se publica ya; con una fecha futura queda programado. */
export const publishSchema = z.object({ at: z.coerce.date().optional() });
export type PublishChapter = z.infer<typeof publishSchema>;

/** Una copia para el historial que no se aplica al capítulo (la versión propia en un conflicto). */
export const versionCopySchema = z.strictObject({ title: chapter.title, titleStyle: chapter.titleStyle.optional(), content: chapter.content });
export type VersionCopy = z.infer<typeof versionCopySchema>;

export const orderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(2000) });
export type ChapterOrder = z.infer<typeof orderSchema>;

