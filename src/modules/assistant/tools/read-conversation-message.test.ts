import { describe, expect, it, vi } from "vitest";
import { readAssistantConversationMessage } from "./read-conversation-message";

const messageId = "00000000-0000-4000-8000-000000000001";
const conversationId = "conversation-1";
const userId = "user-1";
const text = "x".repeat(1_999) + "😀" + "y".repeat(5_000);
function repository(overrides = {}) {
  return {
    findConversation: vi.fn(async () => ({ id: conversationId })),
    findMessage: vi.fn(async () => ({ id: messageId, user_id: userId, conversation_id: conversationId,
      sequence: 3, role: "user", created_at: "2026-09-26T00:00:00Z", parts: [{ type: "text", text }], ...overrides })),
  };
}

describe("readConversationMessage", () => {
  it("reconstructs the full original over bounded pages without splitting surrogate pairs", async () => {
    const repo = repository();
    let offset = 0;
    let restored = "";
    do {
      const page = await readAssistantConversationMessage({ userId, conversationId, messageId, offset }, repo as never);
      expect(page.text.length).toBeLessThanOrEqual(2_000);
      expect(page).toMatchObject({ messageId, sequence: 3, role: "user", totalChars: text.length });
      expect(page.text).not.toMatch(/[\uD800-\uDBFF]$/u);
      restored += page.text;
      if (!page.hasMore) { expect(page.nextOffset).toBeNull(); break; }
      expect(page.nextOffset).toBeGreaterThan(offset);
      offset = page.nextOffset!;
    } while (true);
    expect(restored).toBe(text);
  });

  it.each([{ user_id: "other-user" }, { conversation_id: "other-conversation" }])("rejects an original from another scope: %o", async (overrides) => {
    await expect(readAssistantConversationMessage({ userId, conversationId, messageId }, repository(overrides) as never)).rejects.toThrow("unavailable");
  });

  it("reads fork copies but rejects ids of their source conversation", async () => {
    await expect(readAssistantConversationMessage({ userId, conversationId: "fork", messageId }, repository({ conversation_id: "fork" }) as never)).resolves.toMatchObject({ messageId });
    await expect(readAssistantConversationMessage({ userId, conversationId: "fork", messageId }, repository() as never)).rejects.toThrow("unavailable");
  });

  it("rejects invalid offsets and limits", async () => {
    for (const offset of [-1, 0.5, text.length + 1, 2_000]) {
      await expect(readAssistantConversationMessage({ userId, conversationId, messageId, offset }, repository() as never)).rejects.toThrow();
    }
    await expect(readAssistantConversationMessage({ userId, conversationId, messageId, limit: 4_001 }, repository() as never)).rejects.toThrow();
  });

  it("does not read a message when the conversation is unavailable", async () => {
    const repo = repository();
    repo.findConversation.mockResolvedValue(null as never);
    await expect(readAssistantConversationMessage({ userId, conversationId, messageId }, repo as never)).rejects.toThrow("unavailable");
    expect(repo.findMessage).not.toHaveBeenCalled();
  });
});
