import { randomBytes } from 'node:crypto';
import type { Block } from '../db/schema.js';

/**
 * Cada bloque de un capítulo (párrafo o plantilla) lleva un id estable: es el ancla de los
 * comentarios por párrafo. El editor lo conserva al escribir y le da uno nuevo al partir o pegar;
 * la API lo vuelve a revisar (no se confía en el cliente): a un bloque sin id o con un id repetido
 * se le da uno nuevo, y el primero que lo usa se lo queda.
 */
export const BLOCK_ID = /^[A-Za-z0-9_-]{1,32}$/;

export const newBlockId = () => randomBytes(6).toString('base64url');

/** El contenido del bloque, sin el id: sirve para reconocer el mismo bloque en otra versión. */
const body = ({ id: _id, ...rest }: Block) => JSON.stringify(rest);

/**
 * Deja cada bloque con un id único. `previous` (opcional) es el contenido de antes: un bloque sin id
 * que es idéntico a uno de antes hereda su id, así restaurar una copia vieja no deja comentarios huérfanos.
 */
export function withIds(blocks: Block[], previous: Block[] = []): Block[] {
  const taken = new Set(blocks.flatMap((b) => (b.id ? [b.id] : [])));
  const byBody = new Map<string, string[]>();
  for (const b of previous) if (b.id && !taken.has(b.id)) byBody.set(body(b), [...(byBody.get(body(b)) ?? []), b.id]);
  const seen = new Set<string>();
  return blocks.map((b) => {
    if (b.id && !seen.has(b.id)) { seen.add(b.id); return b; }
    let id = byBody.get(body(b))?.find((candidate) => !seen.has(candidate));
    while (!id || seen.has(id) || taken.has(id)) id = newBlockId();
    seen.add(id);
    return { ...b, id };
  });
}
