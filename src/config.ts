import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  DATABASE_URL: z.string().url().default("postgres://postgres:postgres@localhost:5432/atendimento"),
  LOG_LEVEL: z.string().default("info"),
  META_API_BASE_URL: z.string().url().default("http://localhost:8001"),
  META_APP_SECRET: z.string().min(1),
  META_PHONE_NUMBER_ID: z.string().min(1).default("123456789012345"),
  META_TOKEN: z.string().min(1).default("mock-token"),
  META_VERIFY_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  PORT: z.coerce.number().int().positive().default(8000),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
});

export const env = envSchema.parse(process.env);
