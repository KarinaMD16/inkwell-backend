import { desc, eq, inArray } from 'drizzle-orm';
import { chapterVersions, chapters, type VersionReason } from '../db/schema.js';
import type { Tx } from './tagging.js';

type ChapterRow = typeof chapters.$inferSelect;

/**
 * Historial de un capítulo: una red de seguridad, no un registro de cada tecla. Mientras se escribe,
 * para volver atrás está Ctrl+Z. En la base se guarda poco, para no llenarla de copias que nadie usa:
 * - una copia por sesión de escritura: cómo estaba antes de empezar a editar (sesión nueva = 30 minutos sin guardar);
 * - copias de seguridad: antes de publicar, antes de un borrado grande, en un conflicto y antes de restaurar.
 */
export const MAX_VERSIONS = 10;
/** Sin guardar durante este tiempo, el próximo guardado empieza una sesión nueva. */
const SESSION_GAP_MS = 30 * 60_000;
/** Las copias de sesión se borran solas después de esto. Las de seguridad no. */
const SESSION_TTL_MS = 30 * 24 * 3_600_000;
/** Un borrado que deja menos de la mitad del texto (desde 50 palabras) siempre guarda copia antes. */
const CUT_MIN_WORDS = 50;

/**
 * ¿Hay que guardar una copia de `current` antes de reemplazarlo por algo de `nextWords` palabras?
 * Devuelve el motivo, o null si no hace falta.
 */
export function reasonToKeep(current: ChapterRow, nextWords: number, now: Date): VersionReason | null {
  if (!current.content.length) return null; // un capítulo vacío no tiene nada que perder
  if (current.words >= CUT_MIN_WORDS && nextWords < current.words / 2) return 'recorte';
  return now.getTime() - current.updatedAt.getTime() >= SESSION_GAP_MS ? 'sesion' : null;
}

/** Guarda una copia del capítulo tal como está y ordena el historial. */
export async function keepVersion(tx: Tx, chapter: ChapterRow, reason: VersionReason, now: Date) {
  await tx.insert(chapterVersions).values({
    chapterId: chapter.id, revision: chapter.revision, title: chapter.title, titleStyle: chapter.titleStyle,
    content: chapter.content, words: chapter.words, reason, createdAt: now,
  });
  await prune(tx, chapter.id, now);
}

/**
 * Deja el historial dentro del tope:
 * 1. las copias de sesión de más de 30 días se van;
 * 2. si todavía hay más de 10, se borran las más viejas: primero las de sesión, después las de seguridad
 *    y, solo si no queda otra, las de "publicado" (así siempre se puede volver a lo que se publicó).
 */
export async function prune(tx: Tx, chapterId: string, now: Date) {
  const rows = await tx
    .select({ id: chapterVersions.id, reason: chapterVersions.reason, at: chapterVersions.createdAt })
    .from(chapterVersions)
    .where(eq(chapterVersions.chapterId, chapterId))
    .orderBy(desc(chapterVersions.createdAt));
  const drop = new Set(rows.filter((v) => v.reason === 'sesion' && now.getTime() - v.at.getTime() > SESSION_TTL_MS).map((v) => v.id));
  let left = rows.filter((v) => !drop.has(v.id));
  const order = (v: (typeof rows)[number]) => (v.reason === 'sesion' ? 0 : v.reason === 'publicar' ? 2 : 1);
  while (left.length > MAX_VERSIONS) {
    const oldestFirst = [...left].reverse();
    const victim = [0, 1, 2].map((rank) => oldestFirst.find((v) => order(v) === rank)).find(Boolean)!;
    drop.add(victim.id);
    left = left.filter((v) => v !== victim);
  }
  if (drop.size) await tx.delete(chapterVersions).where(inArray(chapterVersions.id, [...drop]));
}
