import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import path from "path";

/**
 * Creates an isolated in-memory (file-based, temp) SQLite PrismaClient for
 * testing. Each test file gets its own DB file so tests don't interfere.
 */
export function createTestPrisma(): PrismaClient {
  // Use the test DB created by prisma migrate (see jest globalSetup)
  const url = process.env["TEST_DATABASE_URL"] ?? "file:./test.db";
  const client = new PrismaClient({
    datasources: { db: { url } },
  });
  return client;
}
