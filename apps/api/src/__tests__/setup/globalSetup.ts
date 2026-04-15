import { execSync } from "child_process";
import path from "path";

/**
 * Jest global setup — runs once before all test suites.
 *
 * Pushes the Prisma schema to a fresh test SQLite database.
 */
export default async function globalSetup(): Promise<void> {
  const apiDir = path.resolve(__dirname, "../../../");
  const dbPath = path.resolve(apiDir, "test.db");

  execSync("npx prisma db push --force-reset --skip-generate", {
    cwd: apiDir,
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    },
    stdio: "inherit",
  });
}
