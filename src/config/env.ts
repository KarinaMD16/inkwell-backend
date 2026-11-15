import { z } from 'zod';

/**
 * Variables de entorno, validadas al arrancar: si falta algo, la API no levanta
 * y el error dice exactamente qué variable corregir.
 */
const schema = z.object({
  PORT: z.coerce.number().default(3001),
  /** Postgres de Supabase. Usa la cadena del "Session pooler" (puerto 5432). */
  DATABASE_URL: z.string().min(1, 'falta DATABASE_URL'),
  /** https://<ref>.supabase.co — de ahí salen las llaves públicas para verificar sesiones. */
  SUPABASE_URL: z.string().url('SUPABASE_URL debe ser una URL, p. ej. https://abcd.supabase.co'),
  /** Solo para proyectos con el JWT secret heredado (HS256). Déjalo vacío con llaves asimétricas. */
  SUPABASE_JWT_SECRET: z.string().optional(),
  /** Orígenes del frontend permitidos, separados por coma. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuración inválida. Revisa tu archivo .env:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
