import { beforeEach, describe, expect, it, vi } from "vitest";

const knowledgeContext = `
# NeoFibra

Fibra Start 300 Mbps por R$ 79,90.
Fibra Plus 600 Mbps por R$ 99,90.
Fibra Max 1 Gbps por R$ 149,90.
`;

describe("assistant reply generation", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/atendimento";
    process.env.META_APP_SECRET = "super-secret-app-secret-trocar";
    process.env.META_VERIFY_TOKEN = "meu-verify-token-secreto";
    process.env.OPENAI_API_KEY = "sk-proj-troque-pela-sua-chave";
  });

  it("answers known plan questions from the local fallback when OpenAI is not configured", async () => {
    const { generateAssistantReply } = await import("./assistant-service.js");

    const reply = await generateAssistantReply({
      history: [],
      knowledgeContext,
      userMessage: "Quais são os planos de vocês?",
    });

    expect(reply).toContain("Fibra Start 300 Mbps");
    expect(reply).toContain("R$ 79,90");
  });

  it("does not invent answers for topics outside the knowledge base", async () => {
    const { generateAssistantReply } = await import("./assistant-service.js");

    const reply = await generateAssistantReply({
      history: [],
      knowledgeContext,
      userMessage: "Vocês vendem seguro de carro?",
    });

    expect(reply).toContain("Não encontrei essa informação");
  });
});
