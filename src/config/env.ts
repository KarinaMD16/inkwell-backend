import { z } from 'zod';

/**
 * Variables de entorno, validadas al arrancar: si falta algo, la API no levanta
 * y el error dice exactamente qué variable corregir.
 */
/** Una variable escrita vacía en el .env (por ejemplo "STORAGE_ENDPOINT=") cuenta como no puesta. */
const blankAsMissing = <T extends z.ZodType>(inner: T) => z.preprocess((v) => (v === '' ? undefined : v), inner);

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

  // Almacenamiento de imágenes (fotos de perfil y portadas), compatible con S3:
  // Supabase Storage ahora, Cloudflare R2 más adelante sin tocar código.
  // Si falta alguna, la API arranca igual y solo la subida de imágenes responde 503.
  /** Endpoint S3. Supabase: https://<ref>.storage.supabase.co/storage/v1/s3 */
  STORAGE_ENDPOINT: blankAsMissing(z.string().url().optional()),
  /** Región del bucket. Supabase: la de tu proyecto (p. ej. us-east-1). R2: auto. */
  STORAGE_REGION: blankAsMissing(z.string().default('auto')),
  STORAGE_BUCKET: blankAsMissing(z.string().optional()),
  STORAGE_ACCESS_KEY_ID: blankAsMissing(z.string().optional()),
  STORAGE_SECRET_ACCESS_KEY: blankAsMissing(z.string().optional()),
  /** Dirección pública del bucket. Supabase: https://<ref>.supabase.co/storage/v1/object/public/<bucket> */
  STORAGE_PUBLIC_URL: blankAsMissing(z.string().url().optional()),
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
