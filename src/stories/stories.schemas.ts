import { z } from 'zod';

// Catálogos. El frontend usa las mismas listas (src/lib/data.ts): si cambias una, cambia la otra.
export const GENRES = [
  'Romance', 'Fantasía', 'Misterio', 'Terror', 'Ciencia ficción', 'Aventura', 'Amistad', 'Humor', 'Drama', 'Paranormal', 'Histórica', 'Deportes',
] as const;
export const KINDS = ['Original', 'Fanfic', 'Poesía', 'No ficción'] as const;
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
  published: story.published.default(false),
});
export type CreateStory = z.infer<typeof createStorySchema>;

/** Editar: solo llega lo que cambia. Un campo que no existe se rechaza. */
export const updateStorySchema = z.strictObject(story).partial();
export type UpdateStory = z.infer<typeof updateStorySchema>;

const text = z.string().max(20000);
const block = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('p'), text,
    align: z.enum(['left', 'center', 'right', 'justify']).optional(),
    marks: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0), z.enum(['b', 'i', 'u'])])).max(500).optional(),
  }),
  z.object({ type: z.literal('chat'), title: z.string().max(120), messages: z.array(z.object({ who: z.string().max(40), text: z.string().max(2000), me: z.boolean().optional() })).max(200) }),
  z.object({ type: z.literal('post'), author: z.string().max(40), text: z.string().max(2000) }),
  z.object({ type: z.literal('ficha'), name: z.string().max(80), tags: z.array(z.string().max(40)).max(12).default([]), text: z.string().max(4000) }),
  z.object({ type: z.literal('interludio'), text }),
]);

const chapter = {
  /** Un borrador puede no tener título todavía. */
  title: z.string().trim().max(120).transform((t) => t || 'Sin título'),
  titleStyle: z.object({ face: z.enum(['redonda', 'novela', 'maquina']), ornament: z.enum(['ninguno', 'sparkle', 'heart', 'moon']) }).nullable(),
  badge: z.string().trim().max(20).nullable(),
  content: z.array(block).max(2000),
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

export const updateChapterSchema = z.strictObject(chapter).partial();
export type UpdateChapter = z.infer<typeof updateChapterSchema>;

/** Sin `at` se publica ya; con una fecha futura queda programado. */
export const publishSchema = z.object({ at: z.coerce.date().optional() });
export type PublishChapter = z.infer<typeof publishSchema>;

export const orderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(2000) });
export type ChapterOrder = z.infer<typeof orderSchema>;

