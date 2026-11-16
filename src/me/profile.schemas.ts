import { z } from 'zod';

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

const birthdate = z
  .string()
  .refine((v) => ageFrom(v) !== null, 'Esa fecha no existe')
  .refine((v) => (ageFrom(v) ?? 0) >= 0, 'Esa fecha todavía no llega')
  .refine((v) => (ageFrom(v) ?? 0) <= 120, 'Revisa el año')
  .refine((v) => (ageFrom(v) ?? MIN_AGE) >= MIN_AGE, `Necesitas tener al menos ${MIN_AGE} años`)
  .nullable();

export const updateProfileSchema = z
  .object({
    handle: z.string().trim().toLowerCase()
      .min(3, 'Usa al menos 3 caracteres').max(24, 'Usa 24 caracteres como máximo')
      .regex(/^[a-z0-9._]+$/, 'Solo letras, números, punto y guion bajo, sin espacios'),
    name: z.string().trim().min(1, 'Escribe tu nombre').max(60, 'Usa 60 caracteres como máximo'),
    bio: z.string().trim().max(300, 'La descripción admite hasta 300 caracteres'),
    link,
    birthdate,
  })
  .partial()
  .strict();

export type ProfilePatch = z.infer<typeof updateProfileSchema>;
