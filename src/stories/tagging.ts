import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { fold, slugify } from '../common/slug.js';
import type { Db } from '../db/db.module.js';
import { profiles, stories, storyTags, tags, type TagKind } from '../db/schema.js';

/** Los campos de una historia de los que salen sus etiquetas. */
export interface Tagged {
  title: string; tagline: string; kind: string; genre: string; subgenres: string[]; fandom: string; relation: string | null;
  characters: string[]; tropes: string[]; warnings: string[]; freeTags: string[];
}
/** La base o una transacción abierta. */
export type Tx = Pick<Db, 'select' | 'selectDistinct' | 'insert' | 'update' | 'delete' | 'execute'>;
const key = (kind: string, slug: string) => `${kind}:${slug}`;

/**
 * Guarda las etiquetas de una historia en sus dos copias (ver el comentario de `stories` en el
 * esquema) y rehace su texto de búsqueda. Devuelve los campos con el nombre canónico de cada
 * etiqueta: si alguien ya creó "Slow burn", quien escriba "slow burn" queda con "Slow burn".
 * Va siempre dentro de una transacción.
 */
export async function saveTags(tx: Tx, storyId: string, input: Tagged): Promise<Tagged> {
  const fanfic = input.kind === 'Fanfic';
  const groups: [TagKind, string[]][] = [
    ['genero', [input.genre, ...input.subgenres]],
    ['fandom', fanfic ? [input.fandom] : []],
    ['relacion', input.relation ? [input.relation] : []],
    ['personaje', input.characters],
    ['tropo', input.tropes],
    ['advertencia', input.warnings],
    ['libre', input.freeTags],
  ];
  const wanted = new Map<string, { kind: TagKind; slug: string; name: string }>();
  for (const [kind, names] of groups) {
    for (const name of names) {
      const slug = slugify(name);
      if (slug && !wanted.has(key(kind, slug))) wanted.set(key(kind, slug), { kind, slug, name });
    }
  }
  const list = [...wanted.values()];

  const found = new Map<string, { id: string; name: string }>();
  if (list.length) {
    await tx.insert(tags).values(list).onConflictDoNothing();
    const rows = await tx.select({ id: tags.id, kind: tags.kind, slug: tags.slug, name: tags.name }).from(tags)
      .where(or(...list.map((t) => and(eq(tags.kind, t.kind), eq(tags.slug, t.slug)))));
    for (const r of rows) found.set(key(r.kind, r.slug), { id: r.id, name: r.name });
  }
  const canon = (kind: TagKind, names: string[]) => {
    const out: string[] = [];
    for (const name of names) {
      const canonical = found.get(key(kind, slugify(name)))?.name;
      if (canonical && !out.includes(canonical)) out.push(canonical);
    }
    return out;
  };
  const saved: Tagged = {
    ...input,
    subgenres: input.subgenres.filter((g, i, all) => g !== input.genre && all.indexOf(g) === i),
    fandom: fanfic ? (canon('fandom', [input.fandom])[0] ?? input.fandom) : 'Original',
    relation: canon('relacion', input.relation ? [input.relation] : [])[0] ?? null,
    characters: canon('personaje', input.characters),
    tropes: canon('tropo', input.tropes),
    warnings: canon('advertencia', input.warnings),
    freeTags: canon('libre', input.freeTags),
  };

  const before = await tx.select({ id: storyTags.tagId }).from(storyTags).where(eq(storyTags.storyId, storyId));
  const ids = [...found.values()].map((t) => t.id);
  await tx.delete(storyTags).where(eq(storyTags.storyId, storyId));
  if (ids.length) await tx.insert(storyTags).values(ids.map((tagId) => ({ storyId, tagId })));

  const names = [...found.values()].map((t) => t.name);
  await tx.update(stories).set({
    subgenres: saved.subgenres, fandom: saved.fandom, relation: saved.relation, characters: saved.characters,
    tropes: saved.tropes, warnings: saved.warnings, freeTags: saved.freeTags,
    searchText: fold([saved.title, saved.tagline, ...names].join(' ')),
  }).where(eq(stories.id, storyId));

  await recount(tx, [...new Set([...before.map((b) => b.id), ...ids])]);
  return saved;
}

/**
 * Recalcula en cuántas historias visibles se usa cada etiqueta. Llamar cuando una historia cambia
 * de etiquetas o de visibilidad (publicarla, retirarla, suspender a su autora…).
 */
export async function recount(tx: Tx, tagIds: string[]) {
  if (!tagIds.length) return;
  await tx.update(tags).set({
    uses: sql`(select count(*) from ${storyTags} join ${stories} on ${stories.id} = ${storyTags.storyId}
      where ${storyTags.tagId} = ${tags.id} and ${stories.published} and ${stories.removedAt} is null
      and not exists (select 1 from ${profiles} where ${profiles.id} = ${stories.authorId} and ${profiles.suspendedAt} is not null))`,
  }).where(inArray(tags.id, tagIds));
}

/** Etiquetas de todas las historias de una autora: para recontar al suspenderla o reactivarla. */
export async function tagIdsOfAuthor(tx: Tx, authorId: string): Promise<string[]> {
  const rows = await tx.selectDistinct({ id: storyTags.tagId }).from(storyTags)
    .innerJoin(stories, eq(stories.id, storyTags.storyId)).where(eq(stories.authorId, authorId));
  return rows.map((r) => r.id);
}

export async function tagIdsOf(tx: Tx, storyId: string): Promise<string[]> {
  return (await tx.select({ id: storyTags.tagId }).from(storyTags).where(eq(storyTags.storyId, storyId))).map((r) => r.id);
}
