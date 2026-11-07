import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: "../../.env" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set')

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dbCredentials: { url },
  schemaFilter: ["app", "raw"], // no introspection with dbt schemas
});
