import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../routers";
import { createContext } from "../../context";
import type { AuthUser } from "../../context";

/**
 * Creates a tRPC caller bound to a given user context.
 * This allows calling procedures directly in tests without an HTTP layer.
 */
export function createCaller(prisma: PrismaClient, user: AuthUser | null) {
  const ctx = createContext(user);
  // Override prisma with the test instance
  ctx.prisma = prisma;
  return appRouter.createCaller(ctx);
}

// ---------------------------------------------------------------------------
// Fixture users
// CUIDs must start with 'c', be lowercase alphanumeric, and ~25 chars.
// ---------------------------------------------------------------------------

export const adminUser: AuthUser = {
  id: "cltest0admin0000000000001",
  role: "admin",
};

export const instructorUser: AuthUser = {
  id: "cltest0instr0000000000001",
  role: "instructor",
};

export const instructor2User: AuthUser = {
  id: "cltest0instr0000000000002",
  role: "instructor",
};

export const studentUser: AuthUser = {
  id: "cltest0stude0000000000001",
  role: "student",
};
