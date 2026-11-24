# Inkwell — flujo de escritura y modelo de datos (16 nov. 2026)

Decisiones tomadas al construir "crear, escribir, borradores y publicar". Complementa `docs/inkwell-contexto.md`.

## Flujo
1. **Escribir** en la navegación es un menú con dos caminos: *Mis historias* (`/escribir`) y *Nueva historia* (`/escribir/nueva`).
2. **Nueva historia** crea solo la carcasa del libro (título, gancho, sinopsis, tipo, géneros, etiquetas, clasificación, portada). Botón: "Crear borrador".
3. **Trabajar en la historia** (`/escribir/<slug>`): resumen (portada, título, sinopsis, género), estado (En curso / En pausa / Completa), capítulos con su estado y orden (subir/bajar), nuevo capítulo, importar .docx, y "Con cuidado" (esconder o eliminar la historia). Los detalles completos se editan en "Editar detalles".
4. **Editor** (`/editor/<slug>?cap=<id>`): una sola hoja tipo Word (TipTap). Negrita, cursiva, subrayado, alineación, deshacer/rehacer. Las plantillas (chat, post, ficha, interludio) se insertan como tarjetas donde está el cursor. Autoguardado en la cuenta cada 2 s para borradores; un capítulo publicado solo cambia con "Guardar cambios".
5. **Publicar**: por capítulo (ya o programado). La historia queda publicada al publicar su primer capítulo; despublicar un capítulo lo devuelve a borrador.

Importar .docx sigue siendo una maqueta: falta la detección real en la API (mammoth).

## Modelo de datos
- `stories`: `kind` (Original, Fanfic, Poesía, No ficción), `genre` + `subgenres` (hasta 2), `fandom` (solo fanfic), `relation`, `characters`, `tropes`, `warnings`, `free_tags`, `rating`, `status`, `license`, `language`, `search_text`.
- `tags` (catálogo por categoría: genero, fandom, personaje, relacion, tropo, advertencia, libre; `slug` sin tildes ni mayúsculas; `uses` = historias visibles que la usan) y `story_tags`. Las etiquetas se guardan dos veces a propósito: como texto en la historia (mostrar sin joins) y normalizadas (filtrar incluir/excluir, autocompletar). Las escribe solo `stories/tagging.ts`.
- Búsqueda: índice GIN sobre `to_tsvector('simple', search_text)`; sin tildes y por prefijo.
- `chapters`: `title_style`, `words`, `updated_at`; `published_at` null = borrador, futura = programado. Quien lee ve una numeración que cuenta solo lo publicado.
- Párrafo: `{ type: "p", text, align?, marks? }` con `marks` = `[inicio, fin, "b"|"i"|"u"]`. El texto plano queda aparte del formato.
- Una historia es visible si `published` y tiene al menos un capítulo publicado.

## Pendiente
Importación .docx real, sinónimos de etiquetas, conectar los filtros de Explorar a `tags`/`exclude` de la API, comentarios, estadísticas por capítulo.
