import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";

import {
  createPreviewConversation,
  deletePreviewConversation,
  getPreviewConversation,
  listPreviewConversations,
  respondToPreviewChat,
} from "./local-preview-chat";

describe("local assistant preview", () => {
  const conversationIds: string[] = [];

  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "test-key"));
  afterEach(() => {
    conversationIds.forEach(deletePreviewConversation);
    conversationIds.length = 0;
    vi.unstubAllEnvs();
  });

  it("uses only synthetic demo context and keeps the exchange in local memory", async () => {
    const conversation = createPreviewConversation();
    conversationIds.push(conversation.id);
    const generate = vi.fn(async () => ({ text: "Ces données sont fictives." })) as unknown as typeof generateText;
    const result = await respondToPreviewChat({ conversationId: conversation.id, requestId: crypto.randomUUID(), text: "Comment va mon sommeil ?" }, generate);

    expect(generate).toHaveBeenCalledOnce();
    const call = vi.mocked(generate).mock.calls[0][0];
    expect(call.system).toContain("fictives");
    expect(call.system).toContain("Sommeil");
    expect(call.providerOptions).toMatchObject({ openai: { store: false } });
    expect(result).toMatchObject({ preview: true, userMessage: { role: "user" }, assistantMessage: { role: "assistant" } });
    const secondRequestId = crypto.randomUUID();
    const second = await respondToPreviewChat({ conversationId: conversation.id, requestId: secondRequestId, text: "Et mon effort ?" }, generate);
    expect(vi.mocked(generate).mock.calls[1][0].messages).toEqual([
      { role: "user", content: "Comment va mon sommeil ?" },
      { role: "assistant", content: "Ces données sont fictives." },
      { role: "user", content: "Et mon effort ?" },
    ]);
    expect(await respondToPreviewChat({ conversationId: conversation.id, requestId: secondRequestId, text: "Et mon effort ?" }, generate)).toBe(second);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(getPreviewConversation(conversation.id)?.messages).toHaveLength(4);
    expect(listPreviewConversations()).toEqual(expect.arrayContaining([expect.objectContaining({ id: conversation.id })]));
  });

  it("requires a server key and rejects photos before any model call", async () => {
    const conversation = createPreviewConversation();
    conversationIds.push(conversation.id);
    const generate = vi.fn() as unknown as typeof generateText;
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(respondToPreviewChat({ conversationId: conversation.id, requestId: crypto.randomUUID(), text: "Bonjour" }, generate))
      .rejects.toMatchObject({ code: "assistant_not_configured", status: 503 });
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    await expect(respondToPreviewChat({ conversationId: conversation.id, requestId: crypto.randomUUID(), text: "Bonjour", attachmentIds: [crypto.randomUUID()] }, generate))
      .rejects.toMatchObject({ code: "preview_attachments_unavailable", status: 400 });
    expect(generate).not.toHaveBeenCalled();
  });
});
