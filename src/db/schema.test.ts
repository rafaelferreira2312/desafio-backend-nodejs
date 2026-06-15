import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("database schema migration", () => {
  it("enforces idempotency for Meta message redelivery per tenant", async () => {
    const migration = await readFile("drizzle/0000_warm_toro.sql", "utf8");

    expect(migration).toContain('CONSTRAINT "messages_tenant_wa_message_id_unique" UNIQUE("tenant_id","wa_message_id")');
  });

  it("keeps WhatsApp contacts unique inside each tenant", async () => {
    const migration = await readFile("drizzle/0000_warm_toro.sql", "utf8");

    expect(migration).toContain('CONSTRAINT "contacts_tenant_wa_id_unique" UNIQUE("tenant_id","wa_id")');
  });
});
