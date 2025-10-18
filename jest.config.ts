import type { Config } from "jest";

const config: Config = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src/__tests__"],
    moduleFileExtensions: ["ts", "js", "json"],
    modulePaths: ["<rootDir>/src"],
    clearMocks: true,
};

export default config;
