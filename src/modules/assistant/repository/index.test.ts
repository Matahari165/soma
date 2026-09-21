import { beforeEach, describe, expect, it, vi } from "vitest";

import { assistantDatabaseRequest } from "./database";
import {
  attachAssistantAttachmentToMessage,
  createAssistantAttachment,
  deleteAssistantAttachmentMetadata,
  findAssistantAttachment,
  listAssistantAttachments,
} from "./index";

vi.mock("./database", () => ({
  assistantDatabaseRequest: vi.fn(),
  assistantFilter: (value: string) => encodeURIComponent(value),
}));

const userId = "user-1";
const conversationId = "00000000-0000-4000-8000-000000000001";
const attachmentId = "00000000-0000-4000-8000-000000000002";
const objectPath = `assistant/${userId}/${conversationId}/${attachmentId}.webp`;

describe("assistant attachment repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects paths outside the exact user and conversation before persistence", async () => {
    await expect(createAssistantAttachment({
      userId, conversationId, objectPath: `assistant/other/${conversationId}/${attachmentId}.webp`,
      mediaType: "image/webp", byteSize: 100, sha256: "a".repeat(64), purpose: "context",
    })).rejects.toThrow(/does not match its owner/);
    expect(assistantDatabaseRequest).not.toHaveBeenCalled();
  });

  it("derives the metadata id from the validated object path", async () => {
    vi.mocked(assistantDatabaseRequest).mockResolvedValue([{ id: attachmentId }]);
    await createAssistantAttachment({
      userId, conversationId, objectPath, mediaType: "image/webp", byteSize: 100,
      sha256: "a".repeat(64), purpose: "meal",
    });
    expect(assistantDatabaseRequest).toHaveBeenCalledWith("assistant_attachments", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({ id: attachmentId, user_id: userId, conversation_id: conversationId, object_path: objectPath }),
    }));
  });

  it("scopes every metadata operation by user and conversation where applicable", async () => {
    vi.mocked(assistantDatabaseRequest).mockResolvedValue([{ id: attachmentId }]);
    await listAssistantAttachments(userId, conversationId);
    await findAssistantAttachment(userId, attachmentId);
    await attachAssistantAttachmentToMessage(userId, conversationId, attachmentId, "00000000-0000-4000-8000-000000000003");
    await deleteAssistantAttachmentMetadata(userId, attachmentId);

    const paths = vi.mocked(assistantDatabaseRequest).mock.calls.map(([path]) => path);
    expect(paths[0]).toContain(`user_id=eq.${userId}&conversation_id=eq.${conversationId}`);
    expect(paths[1]).toContain(`user_id=eq.${userId}&id=eq.${attachmentId}`);
    expect(paths[2]).toContain(`user_id=eq.${userId}&conversation_id=eq.${conversationId}&id=eq.${attachmentId}`);
    expect(paths[3]).toContain(`user_id=eq.${userId}&id=eq.${attachmentId}`);
  });
});
