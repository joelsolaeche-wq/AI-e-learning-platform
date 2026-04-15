import { PrismaClient } from "@prisma/client";
import { UserRole } from "@elearning/shared";

// ---------------------------------------------------------------------------
// Shared Prisma instance
// ---------------------------------------------------------------------------

export const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// tRPC context
// ---------------------------------------------------------------------------

/**
 * Represents the currently authenticated user.
 * In production this would be populated from a JWT / session; for this
 * implementation callers inject it directly when creating the context.
 */
export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface Context {
  prisma: PrismaClient;
  user: AuthUser | null;
}

export function createContext(user: AuthUser | null = null): Context {
  return { prisma, user };
}
