# Reglas de trabajo

> Reglas básicas que se aplican en todo lo que hacemos. Las de "Inkwell" aplican solo a ese proyecto. Última actualización: 24 nov. 2026.

## Frontend / UX-UI

1. **Componentes propios y reutilizables.** Se pueden usar librerías y componentes base (TipTap, primitivas accesibles, etc.), pero el aspecto siempre es propio: ningún elemento debe parecer copiado. Se construye una vez y se reutiliza.
2. **Identidad constante.** Los elementos que dan identidad y estilo (marca, colores, tipografía, gestos firma) se mantienen iguales en toda la app.
3. **Consistencia y sistema de diseño.** Patrones, colores, tipografías, iconos y comportamientos uniformes en toda la interfaz. Todo sale del sistema de diseño (tokens y componentes compartidos), no de estilos sueltos.
4. **Visibilidad del estado y retroalimentación.** Todas las pantallas tienen loader; las páginas enteras y los elementos grandes usan *skeleton loaders*. Cada clic muestra de inmediato qué está pasando: ningún botón debe parecer que no hace nada y la app nunca debe sentirse lenta.
5. **Centrado en el usuario, poca carga cognitiva.** Las funciones grandes se diseñan para ser simples e intuitivas.
6. **Prevención y recuperación de errores.** Todo error se explica con claridad: el usuario sabe qué falló, por qué y qué puede hacer.
7. **Flujo claro.** Recorridos y llamadas a la acción (CTA) intuitivos, directos y fáciles de reconocer, sin tener que memorizar pasos.
8. **Jerarquía visual.** Tamaños, pesos y posiciones hacen que se note primero lo más importante y que las acciones principales se distingan de las secundarias.
9. **Contraste y alineación.** Texto legible sobre su fondo y elementos alineados con precisión.
10. **Accesibilidad.** El texto se guarda como texto y el estilo se aplica aparte, para que sea buscable y lo lean los lectores de pantalla.
11. **100 % responsive, y bien diseñado en cada tamaño.** Todo cambio en la interfaz se hace y se revisa en móvil, tablet y escritorio. No basta con que el contenido "quepa": cada tamaño cumple las mismas reglas de UX/UI (jerarquía, contraste, alineación, áreas táctiles de al menos 44 px) y se ve bien. La distribución se adapta, no se apila sin más: por ejemplo, una cuadrícula de 3 × 3 en escritorio pasa a una de 2 columnas (o la que mejor encaje) en móvil, no a una sola columna con todo hacia abajo. Una sola columna solo cuando es la mejor lectura para ese contenido.
12. **Movimiento con intención.** Los íconos se animan al pasar el cursor (y al enfocarlos con teclado). Toda interacción con el sistema (abrir un menú, mostrar un aviso, cambiar de estado, guardar, cargar) lleva una transición fluida y sencilla, para que la experiencia se sienta suave. Transiciones cortas (150–300 ms) y discretas, que acompañan la acción sin retrasarla ni distraer; los gestos de los íconos, que son parte de la personalidad de Inkwell, pueden durar hasta 700 ms. Se usan solo `transform` y `opacity`, para que no se trabe en celulares de gama baja, y se respeta `prefers-reduced-motion`: quien pide menos movimiento ve los cambios sin animación.

## Backend

1. **SOLID**, con el sistema preparado para muchos usuarios concurrentes.
2. **Configuración en el entorno.** Credenciales, URLs y claves API en variables de entorno, nunca en el código.
3. **Servicios de respaldo como recursos adjuntos.** Base de datos, colas y cachés se tratan como recursos intercambiables vía URL.
4. **Construcción, liberación y ejecución separadas** de forma estricta.
5. **Procesos sin estado.** Nada se guarda en memoria local entre peticiones.
6. **Concurrencia.** Se escala horizontalmente con el modelo de procesos.
7. **ACID** en las operaciones de datos.
8. **Idempotencia.** Repetir una operación produce el mismo resultado que ejecutarla una vez (vital en pagos y APIs).

## Código en general

1. **DRY.** No duplicar lógica; centralizarla.
2. **KISS.** Soluciones simples y legibles antes que arquitecturas complejas.
3. **YAGNI.** Nada de funciones ni abstracciones "por si acaso".

**Cómo conviven YAGNI y "preparados para crecer":** desde el inicio, procesos sin estado, transacciones e idempotencia. Colas, cachés y microservicios solo cuando haga falta de verdad.

## Seguridad

Se aplican a todo el código; las de cada lado van también en el `CLAUDE.md` de su repositorio.

### Seguridad: generales

1. **No confiar en el cliente.** Todo lo que llega del navegador o de la app se valida en el servidor, aunque el front ya lo haya validado (la validación del front es solo para la experiencia).
2. **Mínimo privilegio.** Cada pieza tiene solo los permisos que necesita. La `service_role` key de Supabase vive solo en el backend; el front usa únicamente la `anon` key.
3. **Secretos fuera del repo y del cliente.** Nada secreto en variables `NEXT_PUBLIC_*`; `.env.example` sin valores reales; si una clave se filtra, se rota de inmediato.
4. **Dependencias al día.** `npm audit` antes de cada release, no instalar paquetes sin revisarlos y el lockfile siempre en el repo.
5. **Datos personales mínimos.** Solo se pide y guarda lo necesario. Nada personal (correo, fecha de nacimiento, tokens) en logs, URLs ni mensajes de error.

### Seguridad: backend

6. **Autorización en cada endpoint.** No basta con saber quién eres: hay que verificar que el recurso sea tuyo (p. ej., editar un capítulo exige ser autor de esa historia). Cambiar un id en la URL nunca debe dar acceso a lo de otra persona.
7. **Validación estricta de entrada.** Los esquemas (zod/DTO) rechazan campos de más y los textos tienen largo máximo. Consultas siempre parametrizadas con Drizzle; nunca SQL armado concatenando texto.
8. **Límite de peticiones** (`@nestjs/throttler`) en login, registro, recuperar contraseña, comentarios y subidas.
9. **Errores sin filtrar detalles.** El usuario ve un mensaje claro, nunca un stack trace ni un error de la base de datos; el detalle técnico va solo a los logs.
10. **Subida de archivos segura.** Revisar el tipo real del archivo (no solo la extensión), limitar el tamaño, renombrar con un id propio y reprocesar las imágenes para quitar sus metadatos (pueden incluir la ubicación de quien la subió).
11. **Webhooks verificados.** Los de pagos se aceptan solo con firma válida y se procesan de forma idempotente.
12. **CORS cerrado:** solo los dominios de Inkwell, nunca `*`.

### Seguridad: frontend

13. **Nada de HTML del usuario sin sanear.** El contenido de los capítulos se pinta desde el JSON estructurado, nunca con `dangerouslySetInnerHTML`. Si algún día se importa HTML (p. ej., desde un .docx), pasa por un saneador en el servidor.
14. **Cabeceras de seguridad:** CSP, `frame-ancestors` / `X-Frame-Options`, `Referrer-Policy` y HTTPS obligatorio.
15. **Enlaces externos** con `rel="noopener noreferrer"`; embeds (Spotify, YouTube) solo desde una lista de dominios permitidos.
16. **Sesión fuera de `localStorage`** cuando se pueda: cookies `HttpOnly`, `Secure` y `SameSite`.

## Inkwell (decisiones ya tomadas)

**Diseño**
- Paleta, tipografías, forma y voz de la interfaz (español neutro, tuteo, cercano y respetuoso, sin coloquialismos): `IDENTIDAD.md` (en el repo `inkwell`).
- Identidad propia y reconocible, divertida, fresca, juvenil y moderna, pero sencilla; no "una app más del mismo concepto".
- Las direcciones aprobadas "Tinta" y "Librero" y los gestos firma son el diseño oficial, también en la web. La dirección "Mascota" quedó descartada.
- El responsive móvil de la web es el diseño final de la app nativa.
- Wattpad e Inkitt sirven de referencia solo para los campos a los que la gente está acostumbrada; el flujo no se copia ni debe sentirse copiado.
- Se respetan los términos decididos (p. ej., los votos se llaman "votos").

**Backend y datos**
- Todas las escrituras pasan por la API: verifica el JWT de Supabase, valida los DTO y aplica las reglas de negocio. RLS de Supabase es la segunda capa, con todo denegado por defecto.
- Esquema y migraciones en el repositorio (Drizzle), nunca a mano en el panel.
- Portabilidad: sin triggers complejos ni lógica en Edge Functions, para poder migrar con `pg_dump`.
- Contenido estructurado (capítulos en JSON), no HTML.
- Costo cero de infraestructura en los primeros meses.
- El contenido +18 explícito solo vive en la web.

**Seguridad**

17. **Protección de menores.** El contenido +18 se filtra en el servidor según la edad de la cuenta, no solo se oculta en la interfaz. La edad y la fecha de nacimiento no se muestran a otros usuarios. Mensajes privados entre adultos y menores quedan fuera del MVP; si se agregan, necesitan reglas propias.
18. **Moderación con rastro.** Reportes, bloqueos y acciones de moderación quedan registrados (quién, qué y cuándo). Un usuario bloqueado deja de poder ver el perfil de quien lo bloqueó e interactuar con su contenido.
19. **Cuentas.** Correo verificado antes de publicar o comentar. Login y recuperar contraseña no revelan si un correo existe ("Si ese correo tiene cuenta, te enviamos un enlace").
20. **Derecho a borrar.** El usuario puede eliminar su cuenta y sus datos (lo exigen la política de privacidad y Google Play).
