# Inkwell — Pendientes por bloque

> Hallazgos de las revisiones del frontend y del backend (23–24 nov. 2026) que quedaron fuera del bloque de cuentas y seguridad. Se corrigen cuando se trabaje cada bloque. Al cerrar uno, se borra de aquí.

## Permisos y contenido (bloque siguiente)
- **Contenido +18 por edad (regla 17):** la API no filtra por clasificación; las historias +18 le llegan a cualquiera. Filtrar en el servidor según la edad de la cuenta (sin cuenta y 13–15: todo público y +13; 16–17: +16; +18 solo mayores que lo activen) en lista, ficha, índice y capítulo. El interruptor "Mostrar +16 y +18" de Ajustes debe guardarse en el perfil (hoy vive en el navegador y nada lo usa). El front solo puede cachear públicamente lo apto para todos.
- **Repisa:** `PUT /me/library/:slug` acepta historias no publicadas o escondidas, y la repisa muestra su título y portada. Solo debe aceptar historias visibles.
- **403 → 404:** gestionar una historia ajena responde 403 y confirma que existe; debe ser 404.
- **Idempotencia al crear:** un doble clic o un reintento en "crear historia" o "nuevo capítulo" crea `titulo-2` o un capítulo duplicado. Dos capítulos agregados a la vez chocan con el índice único (ahora el filtro de errores responde 409, pero el capítulo no se crea).
- **Transacción:** guardar un capítulo actualiza el capítulo y la fecha de la historia en dos pasos.
- **Ordenar el código:** `LibraryController` y `ProfilesController` consultan la base sin servicio; `StoriesService` (378 líneas) mezcla lectura pública, gestión, portadas y capítulos; `forget()` está copiado en `MeService` y `StoriesService`.

## Moderación (después)
- Regla 18: reportes, bloqueos entre usuarios y registro de acciones de moderación.

## Cuentas (después)
- Verificación en dos pasos (2FA) con app de autenticación, opcional en Ajustes.

## Lectura y lector
- **Votar:** el botón siempre empieza en "Votar" aunque ya hayas votado (falta traer el estado de la API), no muestra espera mientras responde y, si la API falla, no avisa nada.
- **Compartir:** usa `navigator.share`, que no existe en la mayoría de navegadores de escritorio; ahí el botón no hace nada. Debe copiar el enlace y avisar "Enlace copiado".
- **Repisa:** el botón no muestra espera mientras guarda, y el error ("No se pudo guardar") no dice por qué.
- Abrir un capítulo con sesión guarda la historia en la repisa automáticamente (PUT `/me/library`). Decidir si es lo que se quiere o si solo debe actualizar el progreso de las que ya están guardadas.

## Comentarios
- "Comentar" y el contador de comentarios por párrafo mandan a `/registro` aunque ya tengas sesión. Se arregla cuando existan los comentarios.

## Explorar y búsqueda
- Explorar descarga todas las historias y filtra en el navegador: no escala. Conectar los filtros a `tags`/`exclude` de la API con paginación.
- **Etiquetas bloqueadas** (Ajustes) dice "no aparecen en tus resultados", pero ningún filtro las usa. Además solo vive en el navegador.

## Notificaciones
- Los interruptores de Ajustes se guardan en el navegador, pero nada los lee.
- La pantalla Novedades se quedó sin contenido de ejemplo: mostrar un estado vacío real hasta que la API tenga notificaciones.

## Biblioteca y listas
- Las listas de lectura no existen todavía en la API (se quitó la lista de ejemplo).

## Importar .docx
- La detección de capítulos es una maqueta; falta la detección real en la API (mammoth).

## Moodboard musical
- "Abrir en Lyric Island" está deshabilitado sin explicar por qué ni cuándo estará.

## Interfaz en general
- **Errores:** no hay ningún `error.tsx`; si la API se cae, la página muestra el error genérico de Next, en inglés y sin el diseño de Inkwell.
- **Errores en inglés:** `ProfileEditor` y `ImageCropper` muestran `err.message` tal cual cuando no hay conexión ("Failed to fetch"). (`api.ts` ya da mensajes en español por código HTTP.)
- **Estado de espera:** `Btn` no tiene variante de "cargando"; cada pantalla lo resuelve a su manera.
- **DRY:** ya existe `FieldMsg` compartido en `ui.tsx` (lo usan ProfileEditor, la bienvenida y Ajustes), pero `Field` de AuthForm y `NewChapterButton` siguen con su propia versión. Unificar.
