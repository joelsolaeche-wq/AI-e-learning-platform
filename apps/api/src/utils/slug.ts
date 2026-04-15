import { PrismaClient } from "@prisma/client";

/**
 * Converts an arbitrary string into a URL-safe slug.
 *
 * Rules:
 *  - Lower-case
 *  - Non-alphanumeric characters replaced with hyphens
 *  - Consecutive hyphens collapsed to one
 *  - Leading / trailing hyphens stripped
 *
 * @example
 *   toSlug("Hello World! 101") // "hello-world-101"
 */
export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric runs with "-"
    .replace(/^-+|-+$/g, ""); // strip leading / trailing hyphens
}

/**
 * Generates a unique slug for a course title.
 *
 * If the base slug is already taken it appends an incrementing numeric suffix
 * (e.g. "my-course-2", "my-course-3") until a free slot is found.
 *
 * @param prisma  - Prisma client instance
 * @param title   - Raw course title
 * @param excludeId - Optional course ID to exclude from the uniqueness check
 *                    (useful when re-generating a slug on update)
 */
export async function generateUniqueSlug(
  prisma: PrismaClient,
  title: string,
  excludeId?: string
): Promise<string> {
  const base = toSlug(title);

  // Fetch all existing slugs that start with the base slug so we can
  // determine the next available suffix in a single query.
  const existing = await prisma.course.findMany({
    where: {
      slug: { startsWith: base },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { slug: true },
  });

  const takenSlugs = new Set(existing.map((c) => c.slug));

  if (!takenSlugs.has(base)) {
    return base;
  }

  let counter = 2;
  while (takenSlugs.has(`${base}-${counter}`)) {
    counter++;
  }
  return `${base}-${counter}`;
}
