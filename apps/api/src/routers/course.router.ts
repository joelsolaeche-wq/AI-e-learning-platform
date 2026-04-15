import { TRPCError } from "@trpc/server";
import {
  createCourseSchema,
  updateCourseSchema,
  courseIdSchema,
  getCourseBySlugSchema,
  listCoursesSchema,
  type PaginatedResult,
} from "@elearning/shared";
import { router, publicProcedure, instructorProcedure } from "../trpc";
import { generateUniqueSlug } from "../utils/slug";
import type { Course, Module } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shape returned from course queries that include counts */
export interface CourseWithCounts extends Course {
  _count: {
    modules: number;
  };
  instructor: {
    id: string;
    name: string;
    email: string;
  };
}

/** Shape returned for getBySlug (full detail) */
export interface CourseDetail extends Course {
  instructor: {
    id: string;
    name: string;
    email: string;
  };
  modules: Array<
    Module & {
      _count: { lessons: number };
    }
  >;
  _count: {
    modules: number;
  };
  lessonCount: number;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const courseRouter = router({
  // -------------------------------------------------------------------------
  // course.create
  // -------------------------------------------------------------------------
  create: instructorProcedure
    .input(createCourseSchema)
    .mutation(async ({ ctx, input }) => {
      const { title, description, thumbnail, level, price, tags } = input;

      const slug = await generateUniqueSlug(ctx.prisma, title);

      const course = await ctx.prisma.course.create({
        data: {
          title,
          slug,
          description: description ?? null,
          thumbnail: thumbnail ?? null,
          level,
          price,
          tags: JSON.stringify(tags),
          status: "draft",
          instructorId: ctx.user.id,
        },
        include: {
          instructor: { select: { id: true, name: true, email: true } },
          _count: { select: { modules: true } },
        },
      });

      return normalizeCourse(course);
    }),

  // -------------------------------------------------------------------------
  // course.update
  // -------------------------------------------------------------------------
  update: instructorProcedure
    .input(updateCourseSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, title, description, thumbnail, level, price, tags } = input;

      const existing = await ctx.prisma.course.findUnique({ where: { id } });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Course not found",
        });
      }

      // Only the instructor who owns the course (or an admin) may update it
      assertOwnerOrAdmin(ctx.user.id, ctx.user.role, existing.instructorId);

      // Archived courses cannot be edited
      if (existing.status === "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Archived courses cannot be updated",
        });
      }

      // Re-generate slug only if title actually changes
      let slug = existing.slug;
      if (title !== undefined && title !== existing.title) {
        slug = await generateUniqueSlug(ctx.prisma, title, id);
      }

      const course = await ctx.prisma.course.update({
        where: { id },
        data: {
          ...(title !== undefined ? { title, slug } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(thumbnail !== undefined ? { thumbnail } : {}),
          ...(level !== undefined ? { level } : {}),
          ...(price !== undefined ? { price } : {}),
          ...(tags !== undefined ? { tags: JSON.stringify(tags) } : {}),
        },
        include: {
          instructor: { select: { id: true, name: true, email: true } },
          _count: { select: { modules: true } },
        },
      });

      return normalizeCourse(course);
    }),

  // -------------------------------------------------------------------------
  // course.publish
  // -------------------------------------------------------------------------
  publish: instructorProcedure
    .input(courseIdSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.course.findUnique({
        where: { id: input.id },
        include: {
          modules: {
            include: {
              _count: { select: { lessons: true } },
            },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }

      assertOwnerOrAdmin(ctx.user.id, ctx.user.role, existing.instructorId);

      if (existing.status === "published") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Course is already published",
        });
      }

      if (existing.status === "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Archived courses cannot be published. Unarchive first.",
        });
      }

      // Validation: at least one module with at least one lesson
      const hasContent = existing.modules.some(
        (m) => m._count.lessons >= 1
      );

      if (existing.modules.length === 0 || !hasContent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Course must have at least one module with at least one lesson before publishing",
        });
      }

      const course = await ctx.prisma.course.update({
        where: { id: input.id },
        data: { status: "published" },
        include: {
          instructor: { select: { id: true, name: true, email: true } },
          _count: { select: { modules: true } },
        },
      });

      return normalizeCourse(course);
    }),

  // -------------------------------------------------------------------------
  // course.unpublish
  // -------------------------------------------------------------------------
  unpublish: instructorProcedure
    .input(courseIdSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.course.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }

      assertOwnerOrAdmin(ctx.user.id, ctx.user.role, existing.instructorId);

      if (existing.status !== "published") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only published courses can be unpublished",
        });
      }

      const course = await ctx.prisma.course.update({
        where: { id: input.id },
        data: { status: "draft" },
        include: {
          instructor: { select: { id: true, name: true, email: true } },
          _count: { select: { modules: true } },
        },
      });

      return normalizeCourse(course);
    }),

  // -------------------------------------------------------------------------
  // course.archive
  // -------------------------------------------------------------------------
  archive: instructorProcedure
    .input(courseIdSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.course.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }

      assertOwnerOrAdmin(ctx.user.id, ctx.user.role, existing.instructorId);

      if (existing.status === "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Course is already archived",
        });
      }

      const course = await ctx.prisma.course.update({
        where: { id: input.id },
        data: { status: "archived" },
        include: {
          instructor: { select: { id: true, name: true, email: true } },
          _count: { select: { modules: true } },
        },
      });

      return normalizeCourse(course);
    }),

  // -------------------------------------------------------------------------
  // course.getBySlug
  // -------------------------------------------------------------------------
  getBySlug: publicProcedure
    .input(getCourseBySlugSchema)
    .query(async ({ ctx, input }) => {
      const course = await ctx.prisma.course.findUnique({
        where: { slug: input.slug },
        include: {
          instructor: { select: { id: true, name: true, email: true } },
          modules: {
            orderBy: { position: "asc" },
            include: {
              _count: { select: { lessons: true } },
            },
          },
          _count: { select: { modules: true } },
        },
      });

      if (!course) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }

      // Compute total lesson count across all modules
      const lessonCount = course.modules.reduce(
        (sum, m) => sum + m._count.lessons,
        0
      );

      return {
        ...normalizeCourse(course),
        modules: course.modules.map((m) => ({
          id: m.id,
          title: m.title,
          position: m.position,
          lessonCount: m._count.lessons,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        lessonCount,
      };
    }),

  // -------------------------------------------------------------------------
  // course.list
  // -------------------------------------------------------------------------
  list: publicProcedure
    .input(listCoursesSchema)
    .query(async ({ ctx, input }) => {
      const { page, limit, search, status, level, instructorId } = input;
      const skip = (page - 1) * limit;

      const where = {
        ...(search
          ? {
              title: {
                contains: search,
              },
            }
          : {}),
        ...(status ? { status } : {}),
        ...(level ? { level } : {}),
        ...(instructorId ? { instructorId } : {}),
      };

      const [items, total] = await Promise.all([
        ctx.prisma.course.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            instructor: { select: { id: true, name: true, email: true } },
            _count: { select: { modules: true } },
          },
        }),
        ctx.prisma.course.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      const result: PaginatedResult<ReturnType<typeof normalizeCourse>> = {
        items: items.map(normalizeCourse),
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };

      return result;
    }),
});

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Asserts that `userId` either owns the course or is an admin.
 * Throws FORBIDDEN if neither condition is met.
 */
function assertOwnerOrAdmin(
  userId: string,
  role: string,
  instructorId: string
): void {
  if (role !== "admin" && userId !== instructorId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to modify this course",
    });
  }
}

/**
 * Normalises a raw Prisma course record:
 *  - Parses the JSON `tags` field back to an array
 *  - Flattens the `_count` to a plain `moduleCount`
 */
function normalizeCourse(
  course: Course & {
    instructor: { id: string; name: string; email: string };
    _count: { modules: number };
  }
) {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(course.tags);
    if (Array.isArray(parsed)) tags = parsed;
  } catch {
    tags = [];
  }

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    thumbnail: course.thumbnail,
    status: course.status,
    level: course.level,
    price: course.price,
    tags,
    instructor: course.instructor,
    moduleCount: course._count.modules,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}
