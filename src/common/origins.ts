import type { Env } from '../config/env.js';

/** Direcciones de una red de casa u oficina (no de internet): 10.x.x.x, 172.16–31.x.x y 192.168.x.x, por http. */
const LAN = /^http:\/\/(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d{1,5})?$/;

/**
 * ¿Puede la web abierta desde este origen hablar con la API usando la sesión? Los de CORS_ORIGINS
 * siempre; con ALLOW_LAN_ORIGINS (solo en desarrollo, para probar en el teléfono), también los de la
 * red local. Lo usan CORS (main.ts) y la defensa contra CSRF (AuthGuard): así nunca se desalinean.
 */
export function originChecker(env: Env): (origin: string | undefined) => boolean {
  const listed = new Set(env.CORS_ORIGINS.split(',').map((o) => o.trim()));
  return (origin) => Boolean(origin && (listed.has(origin) || (env.ALLOW_LAN_ORIGINS && LAN.test(origin))));
}
