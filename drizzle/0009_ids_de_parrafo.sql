-- Cada bloque de un capítulo (párrafo o plantilla) lleva un id estable, para anclar los comentarios
-- por párrafo. Aquí se le pone uno a los capítulos que ya existen; desde ahora la API lo exige
-- (ver src/stories/block-ids.ts). Las copias del historial no se tocan: al restaurar una, sus
-- bloques heredan el id del bloque igual del capítulo actual.
UPDATE "chapters" SET "content" = (
  SELECT coalesce(jsonb_agg(
    CASE WHEN jsonb_typeof(b -> 'id') = 'string' THEN b
         ELSE b || jsonb_build_object('id', substr(md5(random()::text || clock_timestamp()::text || ord::text), 1, 10)) END
    ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements("content") WITH ORDINALITY AS t(b, ord)
)
WHERE jsonb_array_length("content") > 0;
