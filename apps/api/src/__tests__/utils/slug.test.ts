import { toSlug, generateUniqueSlug } from "../../utils/slug";
import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// toSlug — pure function tests
// ---------------------------------------------------------------------------

describe("toSlug()", () => {
  it("lowercases the input", () => {
    expect(toSlug("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(toSlug("my course title")).toBe("my-course-title");
  });

  it("replaces special characters with hyphens", () => {
    expect(toSlug("Hello, World! 101")).toBe("hello-world-101");
  });

  it("collapses multiple non-alphanumeric characters into a single hyphen", () => {
    expect(toSlug("Hello   ---   World")).toBe("hello-world");
  });

  it("strips leading and trailing hyphens", () => {
    expect(toSlug("  --hello--  ")).toBe("hello");
  });

  it("handles numeric-only strings", () => {
    expect(toSlug("12345")).toBe("12345");
  });

  it("handles strings with unicode by stripping them", () => {
    expect(toSlug("café latte")).toBe("caf-latte");
  });

  it("handles an already-valid slug unchanged", () => {
    expect(toSlug("my-course-title")).toBe("my-course-title");
  });

  it("trims surrounding whitespace before slugifying", () => {
    expect(toSlug("  Introduction to AI  ")).toBe("introduction-to-ai");
  });
});

// ---------------------------------------------------------------------------
// generateUniqueSlug — uses a mocked PrismaClient
// ---------------------------------------------------------------------------

function makePrismaMock(existingSlugs: string[]) {
  return {
    course: {
      findMany: jest.fn().mockResolvedValue(
        existingSlugs.map((slug) => ({ slug }))
      ),
    },
  } as unknown as PrismaClient;
}

describe("generateUniqueSlug()", () => {
  it("returns the base slug when no conflict exists", async () => {
    const prisma = makePrismaMock([]);
    const slug = await generateUniqueSlug(prisma, "Introduction to AI");
    expect(slug).toBe("introduction-to-ai");
  });

  it("appends -2 when the base slug is taken", async () => {
    const prisma = makePrismaMock(["introduction-to-ai"]);
    const slug = await generateUniqueSlug(prisma, "Introduction to AI");
    expect(slug).toBe("introduction-to-ai-2");
  });

  it("increments the counter until a free slot is found", async () => {
    const prisma = makePrismaMock([
      "my-course",
      "my-course-2",
      "my-course-3",
    ]);
    const slug = await generateUniqueSlug(prisma, "My Course");
    expect(slug).toBe("my-course-4");
  });

  it("passes excludeId to the query so the current course is not counted as a conflict", async () => {
    const prisma = makePrismaMock([]);
    await generateUniqueSlug(prisma, "My Course", "some-course-id");
    expect((prisma.course.findMany as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "some-course-id" },
        }),
      })
    );
  });
});
