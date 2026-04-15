/**
 * Integration tests for the course tRPC router.
 *
 * We use a real (SQLite file) database so that all Prisma operations run
 * against actual SQL, giving us high confidence in the queries.
 *
 * Database lifecycle:
 *  - globalSetup  : push the schema (prisma db push --force-reset)
 *  - beforeAll    : seed required User rows
 *  - beforeEach   : clean course/module/lesson tables for test isolation
 *  - afterAll     : disconnect
 *  - globalTeardown: remove the test DB file
 */

import path from "path";
import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  createCaller,
  adminUser,
  instructorUser,
  instructor2User,
  studentUser,
} from "../helpers/caller";

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

const DB_PATH = path.resolve(__dirname, "../../../test.db");
const DB_URL = `file:${DB_PATH}`;

const prisma = new PrismaClient({
  datasources: { db: { url: DB_URL } },
});

const INSTRUCTOR_DB_ID = instructorUser.id;
const INSTRUCTOR2_DB_ID = instructor2User.id;
const ADMIN_DB_ID = adminUser.id;
const STUDENT_DB_ID = studentUser.id;

async function seedUsers(): Promise<void> {
  await prisma.user.upsert({
    where: { id: INSTRUCTOR_DB_ID },
    update: {},
    create: {
      id: INSTRUCTOR_DB_ID,
      email: "instructor@example.com",
      name: "Test Instructor",
      role: "instructor",
    },
  });
  await prisma.user.upsert({
    where: { id: INSTRUCTOR2_DB_ID },
    update: {},
    create: {
      id: INSTRUCTOR2_DB_ID,
      email: "instructor2@example.com",
      name: "Test Instructor 2",
      role: "instructor",
    },
  });
  await prisma.user.upsert({
    where: { id: ADMIN_DB_ID },
    update: {},
    create: {
      id: ADMIN_DB_ID,
      email: "admin@example.com",
      name: "Test Admin",
      role: "admin",
    },
  });
  await prisma.user.upsert({
    where: { id: STUDENT_DB_ID },
    update: {},
    create: {
      id: STUDENT_DB_ID,
      email: "student@example.com",
      name: "Test Student",
      role: "student",
    },
  });
}

async function cleanCourses(): Promise<void> {
  await prisma.lesson.deleteMany();
  await prisma.module.deleteMany();
  await prisma.course.deleteMany();
}

beforeAll(async () => {
  await seedUsers();
});

beforeEach(async () => {
  await cleanCourses();
});

afterAll(async () => {
  await cleanCourses();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Caller factories
// ---------------------------------------------------------------------------

function instructorCaller() {
  return createCaller(prisma, instructorUser);
}

function instructor2Caller() {
  return createCaller(prisma, instructor2User);
}

function adminCaller() {
  return createCaller(prisma, adminUser);
}

function studentCaller() {
  return createCaller(prisma, studentUser);
}

function anonCaller() {
  return createCaller(prisma, null);
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Creates a draft course owned by instructorUser */
async function seedCourse(
  overrides: Partial<{ title: string; description: string }> = {}
) {
  return instructorCaller().course.create({
    title: overrides.title ?? "Introduction to TypeScript",
    description: overrides.description ?? "Learn TypeScript from scratch",
  });
}

/** Adds a module + lesson to a course so it can be published */
async function seedModuleAndLesson(courseId: string) {
  const mod = await prisma.module.create({
    data: { title: "Getting Started", position: 1, courseId },
  });
  await prisma.lesson.create({
    data: { title: "Lesson 1", position: 1, moduleId: mod.id },
  });
  return mod;
}

// ===========================================================================
// course.create
// ===========================================================================

describe("course.create", () => {
  it("creates a draft course with a generated slug", async () => {
    const course = await instructorCaller().course.create({
      title: "Introduction to TypeScript",
    });

    expect(course.title).toBe("Introduction to TypeScript");
    expect(course.slug).toBe("introduction-to-typescript");
    expect(course.status).toBe("draft");
    expect(course.instructor.id).toBe(INSTRUCTOR_DB_ID);
    expect(course.moduleCount).toBe(0);
    expect(course.tags).toEqual([]);
  });

  it("persists optional fields (description, thumbnail, level, price, tags)", async () => {
    const course = await instructorCaller().course.create({
      title: "Advanced React",
      description: "Deep dive into React",
      thumbnail: "https://example.com/thumb.jpg",
      level: "advanced",
      price: 49.99,
      tags: ["react", "frontend"],
    });

    expect(course.description).toBe("Deep dive into React");
    expect(course.thumbnail).toBe("https://example.com/thumb.jpg");
    expect(course.level).toBe("advanced");
    expect(course.price).toBe(49.99);
    expect(course.tags).toEqual(["react", "frontend"]);
  });

  it("generates a unique slug when a collision exists", async () => {
    const first = await instructorCaller().course.create({ title: "My Course" });
    const second = await instructorCaller().course.create({ title: "My Course" });
    const third = await instructorCaller().course.create({ title: "My Course" });

    expect(first.slug).toBe("my-course");
    expect(second.slug).toBe("my-course-2");
    expect(third.slug).toBe("my-course-3");
  });

  it("allows an admin to create a course", async () => {
    const course = await adminCaller().course.create({ title: "Admin Course" });
    expect(course.instructor.id).toBe(ADMIN_DB_ID);
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    await expect(
      anonCaller().course.create({ title: "Anon Course" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws FORBIDDEN for students", async () => {
    await expect(
      studentCaller().course.create({ title: "Student Course" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws on title shorter than 3 characters", async () => {
    await expect(
      instructorCaller().course.create({ title: "AB" })
    ).rejects.toThrow();
  });

  it("throws on an invalid thumbnail URL", async () => {
    await expect(
      instructorCaller().course.create({
        title: "Valid Title",
        thumbnail: "not-a-url",
      })
    ).rejects.toThrow();
  });
});

// ===========================================================================
// course.update
// ===========================================================================

describe("course.update", () => {
  it("updates the title and recalculates the slug", async () => {
    const created = await seedCourse({ title: "Old Title" });

    const updated = await instructorCaller().course.update({
      id: created.id,
      title: "New Title",
    });

    expect(updated.title).toBe("New Title");
    expect(updated.slug).toBe("new-title");
  });

  it("does not change the slug when the title is not provided", async () => {
    const created = await seedCourse({ title: "Stable Title" });

    const updated = await instructorCaller().course.update({
      id: created.id,
      description: "Updated description",
    });

    expect(updated.slug).toBe("stable-title");
    expect(updated.description).toBe("Updated description");
  });

  it("generates a unique slug on title update when there is a conflict", async () => {
    await seedCourse({ title: "Clash" });
    const second = await seedCourse({ title: "Something Else" });

    const updated = await instructorCaller().course.update({
      id: second.id,
      title: "Clash",
    });

    expect(updated.slug).toBe("clash-2");
  });

  it("accepts null to clear optional fields", async () => {
    const created = await instructorCaller().course.create({
      title: "Has Description",
      description: "Some text",
      thumbnail: "https://example.com/thumb.jpg",
    });

    const updated = await instructorCaller().course.update({
      id: created.id,
      description: null,
      thumbnail: null,
    });

    expect(updated.description).toBeNull();
    expect(updated.thumbnail).toBeNull();
  });

  it("allows an admin to update any course", async () => {
    const created = await seedCourse();

    const updated = await adminCaller().course.update({
      id: created.id,
      title: "Updated by Admin",
    });

    expect(updated.title).toBe("Updated by Admin");
  });

  it("throws FORBIDDEN when a different instructor tries to update", async () => {
    const created = await seedCourse();

    await expect(
      instructor2Caller().course.update({ id: created.id, title: "Hijacked" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND for a non-existent course", async () => {
    await expect(
      instructorCaller().course.update({
        id: "clnotfound000000000000001",
        title: "Ghost",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when trying to update an archived course", async () => {
    const created = await seedCourse();
    await instructorCaller().course.archive({ id: created.id });

    await expect(
      instructorCaller().course.update({ id: created.id, title: "New Name" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const created = await seedCourse();
    await expect(
      anonCaller().course.update({ id: created.id, title: "X" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws FORBIDDEN for students", async () => {
    const created = await seedCourse();
    await expect(
      studentCaller().course.update({ id: created.id, title: "X" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws when no update fields are provided (only id)", async () => {
    const created = await seedCourse();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      instructorCaller().course.update({ id: created.id } as any)
    ).rejects.toThrow();
  });
});

// ===========================================================================
// course.publish
// ===========================================================================

describe("course.publish", () => {
  it("publishes a draft course that has at least one module with one lesson", async () => {
    const created = await seedCourse();
    await seedModuleAndLesson(created.id);

    const published = await instructorCaller().course.publish({ id: created.id });

    expect(published.status).toBe("published");
  });

  it("throws BAD_REQUEST when the course has no modules", async () => {
    const created = await seedCourse();

    await expect(
      instructorCaller().course.publish({ id: created.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when the course has modules but no lessons", async () => {
    const created = await seedCourse();
    await prisma.module.create({
      data: { title: "Empty Module", position: 1, courseId: created.id },
    });

    await expect(
      instructorCaller().course.publish({ id: created.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when the course is already published", async () => {
    const created = await seedCourse();
    await seedModuleAndLesson(created.id);
    await instructorCaller().course.publish({ id: created.id });

    await expect(
      instructorCaller().course.publish({ id: created.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when trying to publish an archived course", async () => {
    const created = await seedCourse();
    await instructorCaller().course.archive({ id: created.id });

    await expect(
      instructorCaller().course.publish({ id: created.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws FORBIDDEN for a different instructor", async () => {
    const created = await seedCourse();
    await seedModuleAndLesson(created.id);

    await expect(
      instructor2Caller().course.publish({ id: created.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND for a non-existent course", async () => {
    await expect(
      instructorCaller().course.publish({ id: "clnotfound000000000000002" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows an admin to publish any course", async () => {
    const created = await seedCourse();
    await seedModuleAndLesson(created.id);

    const published = await adminCaller().course.publish({ id: created.id });
    expect(published.status).toBe("published");
  });
});

// ===========================================================================
// course.unpublish
// ===========================================================================

describe("course.unpublish", () => {
  it("reverts a published course back to draft", async () => {
    const created = await seedCourse();
    await seedModuleAndLesson(created.id);
    await instructorCaller().course.publish({ id: created.id });

    const unpublished = await instructorCaller().course.unpublish({
      id: created.id,
    });

    expect(unpublished.status).toBe("draft");
  });

  it("throws BAD_REQUEST when the course is not published (draft)", async () => {
    const created = await seedCourse();

    await expect(
      instructorCaller().course.unpublish({ id: created.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when the course is archived", async () => {
    const created = await seedCourse();
    await instructorCaller().course.archive({ id: created.id });

    await expect(
      instructorCaller().course.unpublish({ id: created.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws FORBIDDEN for a different instructor", async () => {
    const created = await seedCourse();
    await seedModuleAndLesson(created.id);
    await instructorCaller().course.publish({ id: created.id });

    await expect(
      instructor2Caller().course.unpublish({ id: created.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an admin to unpublish any course", async () => {
    const created = await seedCourse();
    await seedModuleAndLesson(created.id);
    await adminCaller().course.publish({ id: created.id });

    const result = await adminCaller().course.unpublish({ id: created.id });
    expect(result.status).toBe("draft");
  });
});

// ===========================================================================
// course.archive
// ===========================================================================

describe("course.archive", () => {
  it("archives a draft course", async () => {
    const created = await seedCourse();

    const archived = await instructorCaller().course.archive({ id: created.id });

    expect(archived.status).toBe("archived");
  });

  it("archives a published course", async () => {
    const created = await seedCourse();
    await seedModuleAndLesson(created.id);
    await instructorCaller().course.publish({ id: created.id });

    const archived = await instructorCaller().course.archive({ id: created.id });

    expect(archived.status).toBe("archived");
  });

  it("throws BAD_REQUEST when already archived", async () => {
    const created = await seedCourse();
    await instructorCaller().course.archive({ id: created.id });

    await expect(
      instructorCaller().course.archive({ id: created.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws FORBIDDEN for a different instructor", async () => {
    const created = await seedCourse();

    await expect(
      instructor2Caller().course.archive({ id: created.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an admin to archive any course", async () => {
    const created = await seedCourse();
    const archived = await adminCaller().course.archive({ id: created.id });
    expect(archived.status).toBe("archived");
  });

  it("throws NOT_FOUND for a non-existent course", async () => {
    await expect(
      instructorCaller().course.archive({ id: "clnotfound000000000000003" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ===========================================================================
// course.getBySlug
// ===========================================================================

describe("course.getBySlug", () => {
  it("returns the course with module and lesson counts", async () => {
    const created = await seedCourse({ title: "Slug Test Course" });
    const mod = await seedModuleAndLesson(created.id);

    // Add a second lesson to the same module
    await prisma.lesson.create({
      data: { title: "Lesson 2", position: 2, moduleId: mod.id },
    });

    const result = await anonCaller().course.getBySlug({
      slug: "slug-test-course",
    });

    expect(result.id).toBe(created.id);
    expect(result.slug).toBe("slug-test-course");
    expect(result.moduleCount).toBe(1);
    expect(result.lessonCount).toBe(2);
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]!.lessonCount).toBe(2);
  });

  it("returns the module list ordered by position", async () => {
    const created = await seedCourse({ title: "Ordered Modules" });
    await prisma.module.createMany({
      data: [
        { title: "Module C", position: 3, courseId: created.id },
        { title: "Module A", position: 1, courseId: created.id },
        { title: "Module B", position: 2, courseId: created.id },
      ],
    });

    const result = await anonCaller().course.getBySlug({
      slug: "ordered-modules",
    });

    expect(result.modules.map((m) => m.title)).toEqual([
      "Module A",
      "Module B",
      "Module C",
    ]);
  });

  it("throws NOT_FOUND for a non-existent slug", async () => {
    await expect(
      anonCaller().course.getBySlug({ slug: "does-not-exist" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is accessible without authentication", async () => {
    const created = await seedCourse({ title: "Public Course" });
    const result = await anonCaller().course.getBySlug({ slug: "public-course" });
    expect(result.id).toBe(created.id);
  });

  it("throws on an invalid slug format", async () => {
    await expect(
      anonCaller().course.getBySlug({ slug: "INVALID_SLUG!" })
    ).rejects.toThrow();
  });
});

// ===========================================================================
// course.list
// ===========================================================================

describe("course.list", () => {
  beforeEach(async () => {
    await instructorCaller().course.create({ title: "TypeScript Basics" });
    await instructorCaller().course.create({ title: "Advanced TypeScript" });

    // Publish "React Fundamentals"
    const c = await instructorCaller().course.create({
      title: "React Fundamentals",
    });
    await seedModuleAndLesson(c.id);
    await instructorCaller().course.publish({ id: c.id });

    await instructor2Caller().course.create({ title: "Vue.js Guide" });
  });

  it("returns paginated results", async () => {
    const result = await anonCaller().course.list({ page: 1, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(4);
    expect(result.totalPages).toBe(2);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPreviousPage).toBe(false);
  });

  it("returns the second page correctly", async () => {
    const result = await anonCaller().course.list({ page: 2, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(true);
  });

  it("filters by status=published", async () => {
    const result = await anonCaller().course.list({
      page: 1,
      limit: 20,
      status: "published",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]!.title).toBe("React Fundamentals");
  });

  it("filters by status=draft", async () => {
    const result = await anonCaller().course.list({
      page: 1,
      limit: 20,
      status: "draft",
    });
    expect(result.total).toBe(3);
  });

  it("filters by search term (title contains)", async () => {
    const result = await anonCaller().course.list({
      page: 1,
      limit: 20,
      search: "TypeScript",
    });

    expect(result.total).toBe(2);
    const titles = result.items.map((c) => c.title);
    expect(titles).toContain("TypeScript Basics");
    expect(titles).toContain("Advanced TypeScript");
  });

  it("filters by instructorId", async () => {
    const result = await anonCaller().course.list({
      page: 1,
      limit: 20,
      instructorId: INSTRUCTOR2_DB_ID,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]!.title).toBe("Vue.js Guide");
  });

  it("returns an empty result when nothing matches", async () => {
    const result = await anonCaller().course.list({
      page: 1,
      limit: 20,
      search: "zzznomatch",
    });

    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.totalPages).toBe(0);
  });

  it("is accessible without authentication", async () => {
    const result = await anonCaller().course.list({ page: 1, limit: 10 });
    expect(result.total).toBeGreaterThan(0);
  });

  it("each item includes moduleCount and tags as an array", async () => {
    const result = await anonCaller().course.list({ page: 1, limit: 20 });
    for (const item of result.items) {
      expect(typeof item.moduleCount).toBe("number");
      expect(Array.isArray(item.tags)).toBe(true);
    }
  });

  it("combines search and status filters", async () => {
    const result = await anonCaller().course.list({
      page: 1,
      limit: 20,
      search: "TypeScript",
      status: "draft",
    });

    expect(result.total).toBe(2);
  });
});

// ===========================================================================
// Zod input validation
// ===========================================================================

describe("Input validation (Zod)", () => {
  it("rejects a negative price in create", async () => {
    await expect(
      instructorCaller().course.create({ title: "Negative Price", price: -10 })
    ).rejects.toThrow();
  });

  it("rejects a tags array longer than 20 entries in create", async () => {
    await expect(
      instructorCaller().course.create({
        title: "Too Many Tags",
        tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
      })
    ).rejects.toThrow();
  });

  it("rejects page < 1 in list", async () => {
    await expect(
      anonCaller().course.list({ page: 0, limit: 10 })
    ).rejects.toThrow();
  });

  it("rejects limit > 100 in list", async () => {
    await expect(
      anonCaller().course.list({ page: 1, limit: 101 })
    ).rejects.toThrow();
  });
});
