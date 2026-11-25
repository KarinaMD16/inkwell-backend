import { z } from 'zod';
import { ROLES } from '../db/schema.js';

const page = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
};

export const usersQuerySchema = z.object({
  /** Busca en @usuario, nombre y correo. */
  q: z.string().trim().max(80).optional(),
  role: z.enum(ROLES).optional(),
  estado: z.enum(['activas', 'suspendidas']).optional(),
  ...page,
});
export type UsersQuery = z.infer<typeof usersQuerySchema>;

export const storiesQuerySchema = z.object({
  /** Busca en el título y en el @ de la autora. */
  q: z.string().trim().max(80).optional(),
  estado: z.enum(['visibles', 'retiradas']).optional(),
  ...page,
});
export type StoriesQuery = z.infer<typeof storiesQuerySchema>;

export const roleSchema = z.object({ role: z.enum(ROLES) });

/** Suspender o retirar siempre lleva un motivo: queda en el registro y lo ve la persona afectada. */
export const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Escribe el motivo (al menos 3 letras)').max(300, 'El motivo es muy largo (máximo 300)'),
});

export const actionsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });
