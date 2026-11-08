import { z } from "zod";

export const Env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.url(),
    CREDENTIALS_MASTER_KEY: z
      .string()
      .refine(
        (s) => Buffer.from(s, "base64").length === 32,
        "must be 32 bytes, base64",
      ),
    CREDENTIALS_KEY_VERSION: z.coerce.number().int().positive().default(1),
    COUPANG_BASE_URL: z
      .url()
      .default("https://api-gateway.coupang.com"),
  })
  .refine(
    (e) =>
      e.NODE_ENV !== "production" ||
      e.COUPANG_BASE_URL === "https://api-gateway.coupang.com",
    {
      message: "COUPANG_BASE_URL must be the official gateway in production",
      path: ["COUPANG_BASE_URL"],
    },
  );
export type Env = z.infer<typeof Env>;
