import { z } from "zod";
import { paginationSchema } from "./pagination.schema";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const CourseStatusSchema = z.enum(["draft", "published", "archived"]);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

export const CourseLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);
export type CourseLevel = z.infer<typeof CourseLevelSchema>;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createCourseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be at most 200 characters"),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be at most 5000 characters")
    .optional(),
  thumbnail: z
    .string()
    .url("Thumbnail must be a valid URL")
    .optional(),
  level: CourseLevelSchema.default("beginner"),
  price: z
    .number()
    .nonnegative("Price must be a non-negative number")
    .default(0),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateCourseSchema = z
  .object({
    id: z.string().cuid("Invalid course ID"),
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be at most 200 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(5000, "Description must be at most 5000 characters")
      .optional()
      .nullable(),
    thumbnail: z
      .string()
      .url("Thumbnail must be a valid URL")
      .optional()
      .nullable(),
    level: CourseLevelSchema.optional(),
    price: z
      .number()
      .nonnegative("Price must be a non-negative number")
      .optional(),
    tags: z.array(z.string().trim().min(1)).max(20).optional(),
  })
  .refine(
    (data) => {
      const { id: _id, ...rest } = data;
      return Object.values(rest).some((v) => v !== undefined);
    },
    { message: "At least one field must be provided for update" }
  );

export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

// ---------------------------------------------------------------------------
// Publish / Unpublish / Archive  (single-field selectors)
// ---------------------------------------------------------------------------

export const courseIdSchema = z.object({
  id: z.string().cuid("Invalid course ID"),
});

export type CourseIdInput = z.infer<typeof courseIdSchema>;

// ---------------------------------------------------------------------------
// Get by slug
// ---------------------------------------------------------------------------

export const getCourseBySlugSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens"
    ),
});

export type GetCourseBySlugInput = z.infer<typeof getCourseBySlugSchema>;

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export const listCoursesSchema = paginationSchema.extend({
  search: z
    .string()
    .trim()
    .max(200, "Search query too long")
    .optional(),
  status: CourseStatusSchema.optional(),
  level: CourseLevelSchema.optional(),
  instructorId: z.string().cuid("Invalid instructor ID").optional(),
});

export type ListCoursesInput = z.infer<typeof listCoursesSchema>;
