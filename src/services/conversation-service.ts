import { and, desc, eq } from "drizzle-orm";

import { env } from "../config.js";
import { db } from "../db/client.js";
import { contacts, conversations, messages, tenants } from "../db/schema.js";
import type { InboundMessage } from "../meta/payload.js";

type Tenant = typeof tenants.$inferSelect;
type Contact = typeof contacts.$inferSelect;
type Conversation = typeof conversations.$inferSelect;
type Message = typeof messages.$inferSelect;

export type PersistInboundResult = {
  contact: Contact;
  conversation: Conversation;
  duplicate: boolean;
  message: Message;
  tenant: Tenant;
};

export async function getOrCreateTenant(phoneNumberId = env.META_PHONE_NUMBER_ID) {
  const slug = `phone-${phoneNumberId}`;

  const [tenant] = await db
    .insert(tenants)
    .values({
      metaPhoneNumberId: phoneNumberId,
      name: `Tenant ${phoneNumberId}`,
      slug,
    })
    .onConflictDoUpdate({
      target: tenants.slug,
      set: {
        metaPhoneNumberId: phoneNumberId,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!tenant) {
    throw new Error("Failed to create tenant");
  }

  return tenant;
}

export async function persistInboundMessage(inbound: InboundMessage): Promise<PersistInboundResult> {
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        metaPhoneNumberId: inbound.phoneNumberId ?? env.META_PHONE_NUMBER_ID,
        name: `Tenant ${inbound.phoneNumberId ?? env.META_PHONE_NUMBER_ID}`,
        slug: `phone-${inbound.phoneNumberId ?? env.META_PHONE_NUMBER_ID}`,
      })
      .onConflictDoUpdate({
        target: tenants.slug,
        set: {
          metaPhoneNumberId: inbound.phoneNumberId ?? env.META_PHONE_NUMBER_ID,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!tenant) {
      throw new Error("Failed to create tenant");
    }

    const [contact] = await tx
      .insert(contacts)
      .values({
        displayName: inbound.displayName,
        tenantId: tenant.id,
        waId: inbound.from,
      })
      .onConflictDoUpdate({
        target: [contacts.tenantId, contacts.waId],
        set: {
          displayName: inbound.displayName,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!contact) {
      throw new Error("Failed to create contact");
    }

    const [existingConversation] = await tx
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, tenant.id),
          eq(conversations.contactId, contact.id),
          eq(conversations.status, "open"),
        ),
      )
      .orderBy(desc(conversations.createdAt))
      .limit(1);

    const conversation =
      existingConversation ??
      (
        await tx
          .insert(conversations)
          .values({
            contactId: contact.id,
            lastMessageAt: new Date(),
            tenantId: tenant.id,
          })
          .returning()
      )[0];

    if (!conversation) {
      throw new Error("Failed to create conversation");
    }

    const [insertedMessage] = await tx
      .insert(messages)
      .values({
        body: inbound.text,
        conversationId: conversation.id,
        direction: "inbound",
        rawPayload: inbound.raw,
        status: "received",
        tenantId: tenant.id,
        waMessageId: inbound.waMessageId,
      })
      .onConflictDoNothing({
        target: [messages.tenantId, messages.waMessageId],
      })
      .returning();

    if (insertedMessage) {
      const [updatedConversation] = await tx
        .update(conversations)
        .set({
          lastMessageAt: insertedMessage.createdAt,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id))
        .returning();

      return {
        contact,
        conversation: updatedConversation ?? conversation,
        duplicate: false,
        message: insertedMessage,
        tenant,
      };
    }

    const [existingMessage] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.tenantId, tenant.id), eq(messages.waMessageId, inbound.waMessageId)))
      .limit(1);

    if (!existingMessage) {
      throw new Error("Failed to find duplicated inbound message");
    }

    return {
      contact,
      conversation,
      duplicate: true,
      message: existingMessage,
      tenant,
    };
  });
}

export async function markMessageQueued(messageId: string) {
  await db.update(messages).set({ status: "queued" }).where(eq(messages.id, messageId));
}
