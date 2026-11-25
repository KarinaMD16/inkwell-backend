import { and, eq, exists, inArray, isNotNull, isNull, lte, notExists, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/db.module.js';
import { chapters, profiles, stories } from '../db/schema.js';
import { ageFrom } from '../me/profile.schemas.js';
import { RATINGS } from '../stories/stories.schemas.js';

/**
 * Qué historias puede ver cada persona. Es la única puerta: toda consulta de lectura (lista,
 * ficha, índice, capítulo, votos, repisa) filtra con `visibleTo`, así la regla vive en un solo
 * lugar (regla 17: el contenido se filtra en el servidor, no se esconde en la interfaz).
 *
 * Hoy decide por edad. Las etiquetas bloqueadas y los bloqueos entre cuentas se suman aquí.
 */

export type Rating = (typeof RATINGS)[number];

/** Quien lee: su id (para ver siempre lo propio) y la clasificación más alta que le toca. */
export interface Viewer {
  id: string;
  maxRating: Rating;
}

/** Sin cuenta se ve lo mismo que a los 13: todo público y +13. */
export const ANONYMOUS_MAX: Rating = '+13';
export const ADULT_AGE = 18;

/**
 * Clasificación más alta según la edad de la cuenta:
 * - sin fecha de nacimiento o de 13 a 15: hasta +13;
 * - de 16 a 17: hasta +16;
 * - mayor de edad: hasta +16, y +18 solo si lo activó en Ajustes.
 */
export function maxRatingFor(birthdate: string | null, showMature: boolean, today = new Date()): Rating {
  const age = birthdate ? ageFrom(birthdate, today) : null;
  if (age === null || age < 16) return ANONYMOUS_MAX;
  if (age < ADULT_AGE) return '+16';
  return showMature ? '+18' : '+16';
}

/** Las clasificaciones permitidas, de la más suave hasta `max`. */
export const ratingsUpTo = (max: Rating): Rating[] => RATINGS.slice(0, RATINGS.indexOf(max) + 1);

/** Un capítulo se puede leer si tiene fecha de publicación y esa fecha ya pasó. */
export const isLive = and(isNotNull(chapters.publishedAt), lte(chapters.publishedAt, sql`now()`));

/**
 * La historia está a la vista: su autora la publicó, moderación no la retiró y la cuenta de la
 * autora no está suspendida. Con `needsChapter`, además ya tiene un capítulo para leer.
 */
export function isPublic(db: Db, needsChapter = true): SQL {
  const authorSuspended = db.select({ one: sql`1` }).from(profiles).where(and(eq(profiles.id, stories.authorId), isNotNull(profiles.suspendedAt)));
  const live = db.select({ one: sql`1` }).from(chapters).where(and(eq(chapters.storyId, stories.id), isLive));
  return and(eq(stories.published, true), isNull(stories.removedAt), notExists(authorSuspended), needsChapter ? exists(live) : undefined)!;
}

/** Su clasificación le toca a quien lee. Lo propio siempre se ve: una autora lee lo que escribió. */
export function ratingAllowed(viewer: Viewer | null): SQL {
  const allowed = inArray(stories.rating, ratingsUpTo(viewer?.maxRating ?? ANONYMOUS_MAX));
  return viewer ? or(allowed, eq(stories.authorId, viewer.id))! : allowed;
}

/** Lo que esta persona (o alguien sin cuenta, con `null`) puede ver. */
export function visibleTo(db: Db, viewer: Viewer | null, opts: { needsChapter?: boolean } = {}): SQL {
  return and(isPublic(db, opts.needsChapter ?? true), ratingAllowed(viewer))!;
}
