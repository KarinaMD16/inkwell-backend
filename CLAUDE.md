# Inkwell — API (NestJS + Supabase)

@AGENTS.md

Reglas de trabajo de este repositorio. Se aplican a todo cambio. Contexto del producto: docs `claude/inkwell-contexto.md` y `claude/inkwell-escritura.md` del Project de Claude.

## Backend

1. **SOLID**, con el sistema preparado para muchos usuarios concurrentes.
2. **Configuración en el entorno.** Credenciales, URLs y claves API en variables de entorno (`.env`, documentadas en `.env.example`), nunca en el código.
3. **Servicios de respaldo como recursos adjuntos.** Base de datos, colas y cachés se tratan como recursos intercambiables vía URL.
4. **Construcción, liberación y ejecución separadas** de forma estricta.
5. **Procesos sin estado.** Nada se guarda en memoria local entre peticiones.
6. **Concurrencia.** Se escala horizontalmente con el modelo de procesos.
7. **ACID.** Las operaciones que tocan varias filas o tablas van en una transacción.
8. **Idempotencia.** Repetir una operación produce el mismo resultado que ejecutarla una vez (vital en pagos y APIs).
9. **Errores claros.** Cada error que devuelve la API dice qué falló y por qué, en un formato que el frontend pueda mostrar tal cual al usuario.

## Decisiones de arquitectura

- Todas las escrituras pasan por esta API: verifica el JWT de Supabase, valida los DTO y aplica las reglas de negocio. RLS de Supabase es la segunda capa, con todo denegado por defecto.
- Esquema y migraciones en el repositorio (Drizzle, carpeta `drizzle/`), nunca a mano en el panel.
- Portabilidad: sin triggers complejos ni lógica en Edge Functions, para poder migrar con `pg_dump` a cualquier Postgres.
- Contenido estructurado (capítulos en JSON), no HTML.
- Costo cero de infraestructura en los primeros meses.
- El contenido +18 explícito solo se sirve a la web.

## Seguridad

La numeración es la misma del doc `claude/reglas-de-trabajo.md`; aquí solo van las que aplican a este repositorio.

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

### Seguridad: específicas de Inkwell

17. **Protección de menores.** El contenido +18 se filtra en el servidor según la edad de la cuenta, no solo se oculta en la interfaz. La edad y la fecha de nacimiento no se muestran a otros usuarios. Mensajes privados entre adultos y menores quedan fuera del MVP; si se agregan, necesitan reglas propias.
18. **Moderación con rastro.** Reportes, bloqueos y acciones de moderación quedan registrados (quién, qué y cuándo). Un usuario bloqueado deja de poder ver el perfil de quien lo bloqueó e interactuar con su contenido.
19. **Cuentas.** Correo verificado antes de publicar o comentar. Login y recuperar contraseña no revelan si un correo existe ("Si ese correo tiene cuenta, te enviamos un enlace").
20. **Derecho a borrar.** El usuario puede eliminar su cuenta y sus datos (lo exigen la política de privacidad y Google Play).

## Código en general

1. **DRY.** No duplicar lógica; centralizarla (p. ej., las etiquetas solo se escriben desde `stories/tagging.ts`).
2. **KISS.** Soluciones simples y legibles antes que arquitecturas complejas.
3. **YAGNI.** Nada de funciones ni abstracciones "por si acaso".

**Cómo conviven YAGNI y "preparados para crecer":** desde el inicio, procesos sin estado, transacciones e idempotencia. Colas, cachés y microservicios solo cuando haga falta de verdad.
