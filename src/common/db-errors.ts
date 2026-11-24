/**
 * ¿El error es un choque con un índice único de Postgres (código 23505)?
 * Drizzle a veces envuelve el error del driver, así que se mira también en `cause`.
 */
export function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) => (typeof e === 'object' && e !== null && 'code' in e ? (e as { code: unknown }).code : undefined);
  return code(err) === '23505' || code((err as { cause?: unknown } | null)?.cause) === '23505';
}
