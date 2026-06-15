import { describe, expect, it } from "vitest";

import { extractInboundMessages } from "./payload.js";

describe("Meta webhook payload parser", () => {
  it("extracts inbound text messages with contact and phone number metadata", () => {
    const message = {
      from: "5511999990000",
      id: "wamid.test-1",
      text: { body: "Quais são os planos?" },
      type: "text",
    };

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Cliente Teste" }, wa_id: "5511999990000" }],
                messages: [message],
                metadata: {
                  phone_number_id: "123456789012345",
                },
              },
            },
          ],
        },
      ],
    };

    expect(extractInboundMessages(payload)).toEqual([
      {
        displayName: "Cliente Teste",
        from: "5511999990000",
        phoneNumberId: "123456789012345",
        raw: message,
        text: "Quais são os planos?",
        waMessageId: "wamid.test-1",
      },
    ]);
  });

  it("ignores invalid payloads instead of throwing in the webhook handler", () => {
    expect(extractInboundMessages({ invalid: true })).toEqual([]);
  });
});
