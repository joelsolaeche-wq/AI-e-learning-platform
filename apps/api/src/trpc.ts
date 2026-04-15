import { TRPCError, initTRPC } from "@trpc/server";
import { Context } from "./context";

// ---------------------------------------------------------------------------
// tRPC initialisation
// ---------------------------------------------------------------------------

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// ---------------------------------------------------------------------------
// Reusable middleware
// ---------------------------------------------------------------------------

/**
 * Middleware that asserts a user is authenticated.
 */
const enforceAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Middleware that asserts the user has one of the allowed roles.
 */
const enforceRoles = (...roles: Array<"student" | "instructor" | "admin">) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be logged in to perform this action",
      });
    }
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `This action requires one of the following roles: ${roles.join(", ")}`,
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });

// ---------------------------------------------------------------------------
// Procedure builders
// ---------------------------------------------------------------------------

/** Requires a valid session */
export const protectedProcedure = t.procedure.use(enforceAuthenticated);

/** Requires instructor or admin role */
export const instructorProcedure = t.procedure.use(
  enforceRoles("instructor", "admin")
);

/** Requires admin role only */
export const adminProcedure = t.procedure.use(enforceRoles("admin"));
