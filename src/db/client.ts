import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/atendimento";

export const sql = postgres(databaseUrl, {
  max: 10,
});

export const db = drizzle(sql, { schema });

export async function closeDb() {
  await sql.end({ timeout: 5 });
}
