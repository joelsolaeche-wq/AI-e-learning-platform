import type { Config } from "jest";
import path from "path";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@elearning/shared$": path.resolve(
      __dirname,
      "../../packages/shared/src/index.ts"
    ),
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // Suppress the baseUrl deprecation warning inside ts-jest
          ignoreDeprecations: "6.0",
          baseUrl: ".",
          paths: {
            "@elearning/shared": ["../../packages/shared/src"],
          },
          rootDir: "../..",
          types: ["jest", "node"],
        },
      },
    ],
  },
  globalSetup: "<rootDir>/src/__tests__/setup/globalSetup.ts",
  globalTeardown: "<rootDir>/src/__tests__/setup/globalTeardown.ts",
  clearMocks: true,
  testTimeout: 30000,
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts"],
};

export default config;
