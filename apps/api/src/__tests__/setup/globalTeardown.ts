import path from "path";
import fs from "fs";

/**
 * Jest global teardown — runs once after all test suites.
 *
 * Removes the test SQLite database file.
 */
export default async function globalTeardown(): Promise<void> {
  const dbPath = path.resolve(__dirname, "../../../test.db");
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
}
