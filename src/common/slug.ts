/** Minúsculas, sin tildes y con todo lo que no sea letra o número convertido en `gap`. */
function plain(text: string, gap: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, gap);
}

/** "Mi rival de la orquesta" -> "mi-rival-de-la-orquesta" */
export function slugify(text: string): string {
  return plain(text, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

/** Texto para buscar: "Órbita baja" -> "orbita baja". Lo que se guarda y lo que se busca pasan por aquí. */
export function fold(text: string): string {
  return plain(text, ' ').trim();
}
