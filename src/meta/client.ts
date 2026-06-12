import { env } from "../config.js";

type SendTextMessageInput = {
  phoneNumberId: string;
  text: string;
  to: string;
};

export async function sendTextMessage({ phoneNumberId, text, to }: SendTextMessageInput) {
  const response = await fetch(`${env.META_API_BASE_URL}/${phoneNumberId}/messages`, {
    body: JSON.stringify({
      messaging_product: "whatsapp",
      text: {
        body: text,
      },
      to,
      type: "text",
    }),
    headers: {
      authorization: `Bearer ${env.META_TOKEN}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meta API returned ${response.status}: ${body}`);
  }

  return response.json() as Promise<unknown>;
}
