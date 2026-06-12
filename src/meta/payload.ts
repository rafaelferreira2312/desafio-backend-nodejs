import { z } from "zod";

const textMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  text: z.object({
    body: z.string(),
  }),
  timestamp: z.string().optional(),
  type: z.literal("text").optional(),
});

const webhookPayloadSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            contacts: z
              .array(
                z.object({
                  profile: z
                    .object({
                      name: z.string().optional(),
                    })
                    .optional(),
                  wa_id: z.string(),
                }),
              )
              .optional(),
            messages: z.array(textMessageSchema).optional(),
            metadata: z
              .object({
                phone_number_id: z.string().optional(),
              })
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

export type InboundMessage = {
  displayName?: string;
  from: string;
  phoneNumberId?: string;
  raw: unknown;
  text: string;
  waMessageId: string;
};

export function extractInboundMessages(payload: unknown): InboundMessage[] {
  const parsed = webhookPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return [];
  }

  return parsed.data.entry.flatMap((entry) =>
    entry.changes.flatMap((change) => {
      const contactsByWaId = new Map(
        change.value.contacts?.map((contact) => [contact.wa_id, contact.profile?.name]) ?? [],
      );

      return (
        change.value.messages?.map((message) => ({
          displayName: contactsByWaId.get(message.from),
          from: message.from,
          phoneNumberId: change.value.metadata?.phone_number_id,
          raw: message,
          text: message.text.body,
          waMessageId: message.id,
        })) ?? []
      );
    }),
  );
}
