import { z } from 'zod';

export const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  genre: z.string().max(40).optional(),
  status: z.enum(['En curso', 'Completa']).optional(),
  author: z.string().max(24).optional(),
  sort: z.enum(['votos', 'recientes', 'lecturas']).default('recientes'),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListQuery = z.infer<typeof listSchema>;

const tags = z.array(z.string().trim().min(1).max(40)).max(12).default([]);

export const createStorySchema = z.object({
  title: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(120).default(''),
  synopsis: z.string().trim().max(2000).default(''),
  genre: z.string().trim().min(1).max(40),
  fandom: z.string().trim().max(60).default('Original'),
  relation: z.string().trim().max(80).optional(),
  tropes: tags,
  warnings: tags,
  rating: z.enum(['Todo público', '+13', '+16', '+18']).default('+13'),
  format: z.enum(['Narrativa', 'Redes sociales', 'Con fichas']).default('Narrativa'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0F8B80'),
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FFFBF8'),
  art: z.enum(['wave', 'chat', 'moon', 'sun', 'dots', 'stripes']).default('sun'),
  published: z.boolean().default(false),
});
export type CreateStory = z.infer<typeof createStorySchema>;

const text = z.string().max(20000);
const block = z.discriminatedUnion('type', [
  z.object({ type: z.literal('p'), text }),
  z.object({ type: z.literal('chat'), title: z.string().max(120), messages: z.array(z.object({ who: z.string().max(40), text: z.string().max(2000), me: z.boolean().optional() })).max(200) }),
  z.object({ type: z.literal('post'), author: z.string().max(40), text: z.string().max(2000) }),
  z.object({ type: z.literal('ficha'), name: z.string().max(80), tags: z.array(z.string().max(40)).max(12).default([]), text: z.string().max(4000) }),
  z.object({ type: z.literal('interludio'), text }),
]);

export const createChapterSchema = z.object({
  title: z.string().trim().min(1).max(120),
  badge: z.string().trim().max(20).optional(),
  content: z.array(block).max(2000).default([]),
  /** true publica ahora; false lo deja como borrador. */
  publish: z.boolean().default(false),
});
export type CreateChapter = z.infer<typeof createChapterSchema>;
