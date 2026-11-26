import { z } from 'zod';
import { INTERESTS } from '../stories/stories.schemas.js';

/** Edad mínima para tener cuenta. Debe coincidir con MIN_AGE del frontend. */
export const MIN_AGE = 13;

/** Años cumplidos a partir de "AAAA-MM-DD". null si la fecha no existe. */
export function ageFrom(iso: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() < mo - 1 || (today.getUTCMonth() === mo - 1 && today.getUTCDate() < d)) age--;
  return age;
}

/**
 * Enlace del perfil. Si la persona escribe "instagram.com/ana" sin https://, se lo agregamos.
 * Solo se aceptan direcciones web (nada de javascript:, mailto:, etc.). Vacío = quitar el enlace.
 */
const link = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    if (!t) return null;
    return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  },
  z
    .url({ protocol: /^https?$/, error: 'El enlace no es una dirección web válida' })
    .max(200, 'El enlace es demasiado largo')
    .refine((u) => URL.canParse(u) && new URL(u).hostname.includes('.'), 'El enlace no es una dirección web válida')
    .nullable(),
);

export const birthdateSchema = z
  .string()
  .refine((v) => ageFrom(v) !== null, 'Esa fecha no existe')
  .refine((v) => (ageFrom(v) ?? 0) >= 0, 'Esa fecha todavía no llega')
  .refine((v) => (ageFrom(v) ?? 0) <= 120, 'Revisa el año')
  .refine((v) => (ageFrom(v) ?? MIN_AGE) >= MIN_AGE, `Necesitas tener al menos ${MIN_AGE} años`);

/**
 * Nombres que nadie puede tomar: evitan que alguien se haga pasar por el equipo o por una página
 * de la app. Se compara sin puntos ni guiones bajos ("a.d.m.i.n" también cuenta).
 * El frontend tiene la misma lista (src/lib/validation.ts): si cambias una, cambia la otra.
 */
export const RESERVED_HANDLES = [
  'admin', 'administrador', 'administracion', 'root', 'sistema', 'system', 'staff', 'equipo', 'oficial',
  'inkwell', 'koral', 'koralstudio', 'soporte', 'support', 'ayuda', 'help', 'moderacion', 'moderador', 'mod', 'mods',
  'seguridad', 'security', 'contacto', 'noreply', 'api', 'www',
  'entrar', 'registro', 'recuperar', 'bienvenida', 'ajustes', 'perfil', 'explorar', 'biblioteca', 'escribir', 'editor',
  'leer', 'historia', 'novedades', 'privacidad', 'terminos', 'null', 'undefined',
];
const RESERVED = new Set(RESERVED_HANDLES);
export const isReservedHandle = (handle: string) => RESERVED.has(handle.replace(/[._]/g, ''));

export const handleSchema = z.string().trim().toLowerCase()
  .min(3, 'Usa al menos 3 caracteres').max(24, 'Usa 24 caracteres como máximo')
  .regex(/^[a-z0-9._]+$/, 'Solo letras, números, punto y guion bajo, sin espacios')
  .refine((h) => !isReservedHandle(h), 'Ese nombre de usuario está reservado. Prueba con otro');

export const updateProfileSchema = z
  .object({
    handle: handleSchema,
    name: z.string().trim().min(1, 'Escribe tu nombre').max(60, 'Usa 60 caracteres como máximo'),
    bio: z.string().trim().max(300, 'La descripción admite hasta 300 caracteres'),
    link,
    /** Se pone una sola vez (ver MeService.update): después ya no cambia. */
    birthdate: birthdateSchema,
    /** Ver historias +18. Solo para mayores de edad (ver MeService.update). */
    showMature: z.boolean(),
    /** Gustos de lectura, sin repetidos. */
    interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).transform((list) => [...new Set(list)]),
  })
  .partial()
  .strict();

export type ProfilePatch = z.infer<typeof updateProfileSchema>;
