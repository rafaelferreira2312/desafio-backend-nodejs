import OpenAI from "openai";

import { env } from "../config.js";

type ChatMessage = {
  body: string;
  direction: "inbound" | "outbound";
};

type GenerateReplyInput = {
  history: ChatMessage[];
  knowledgeContext: string;
  userMessage: string;
};

const unknownAnswer =
  "Não encontrei essa informação na base de conhecimento da NeoFibra. Posso ajudar com planos, preços, cobertura, boleto, instalação, suporte, SLA, cancelamento ou mudança de endereço.";

function hasUsableOpenAiKey() {
  return Boolean(env.OPENAI_API_KEY && !env.OPENAI_API_KEY.includes("troque-pela-sua-chave"));
}

function fallbackReply(userMessage: string, knowledgeContext: string) {
  const normalized = userMessage.toLowerCase();

  if (/(plano|preço|preco|valor|mega|mbps|giga|gbps)/.test(normalized)) {
    return "Temos os planos Fibra Start 300 Mbps por R$ 79,90, Fibra Plus 600 Mbps por R$ 99,90 e Fibra Max 1 Gbps por R$ 149,90. Todos incluem Wi-Fi 6, instalação grátis e roteador em comodato.";
  }

  if (/(boleto|segunda via|2ª via|pix|pagamento|cartão|cartao)/.test(normalized)) {
    return "Você pode emitir a segunda via do boleto pelo app NeoFibra, pelo site ou por este WhatsApp informando seu CPF. Aceitamos boleto, cartão de crédito e Pix.";
  }

  if (/(instala|prazo|agenda)/.test(normalized)) {
    return "O prazo médio de instalação é de 3 dias úteis após a contratação, conforme a agenda técnica da região.";
  }

  if (/(suporte|queda|conexão|conexao|sla|reparo|roteador|los|pon)/.test(normalized)) {
    return "Para queda de conexão, verifique avisos de manutenção, reinicie o roteador por 30 segundos e confira as luzes PON e LOS. O SLA de reparo é de até 48h úteis para residencial e até 8h úteis para empresarial.";
  }

  if (/(cobertura|cep|endereço|endereco|região|regiao)/.test(normalized)) {
    return "Atendemos as regiões metropolitanas de São Paulo, Campinas e Sorocaba. Para verificar disponibilidade no endereço, é necessário informar o CEP.";
  }

  if (/(cancel|fidelidade|multa)/.test(normalized)) {
    return "O cancelamento pode ser solicitado por este canal. Dentro da fidelidade, há multa proporcional ao tempo restante de contrato.";
  }

  return unknownAnswer;
}

export async function generateAssistantReply({ history, knowledgeContext, userMessage }: GenerateReplyInput) {
  if (!hasUsableOpenAiKey()) {
    return fallbackReply(userMessage, knowledgeContext);
  }

  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  const completion = await openai.chat.completions.create({
    messages: [
      {
        content:
          "Você é um atendente da NeoFibra no WhatsApp. Responda em português do Brasil, com clareza e concisão. Use apenas as informações da base de conhecimento. Se a resposta não estiver na base, diga que não sabe e ofereça os temas disponíveis.",
        role: "system",
      },
      {
        content: `Base de conhecimento:\n\n${knowledgeContext}`,
        role: "system",
      },
      ...history.slice(-10).map((message) => ({
        content: message.body,
        role: message.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      })),
      {
        content: userMessage,
        role: "user",
      },
    ],
    model: env.OPENAI_MODEL,
    temperature: 0.2,
  });

  return completion.choices[0]?.message.content?.trim() || unknownAnswer;
}
