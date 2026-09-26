import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({ find: vi.fn(), load: vi.fn(), audit: vi.fn() }));
vi.mock("../repository", () => ({ findAssistantAttachmentInConversation: mocks.find }));
vi.mock("@/lib/r2", () => ({ getR2AssistantAttachment: mocks.load }));
vi.mock("./audited-tool", () => ({ executeAuditedAssistantTool: mocks.audit }));
import { createReopenConversationImageTool } from "./reopen-conversation-image";

const attachmentId = "00000000-0000-4000-8000-000000000001";
const bytes = Buffer.from("synthetic-image-bytes");
const context = { userId: "test-user", runId: "test-run", conversationId: "test-conversation" };
const metadata = { id: attachmentId, conversation_id: context.conversationId, message_id: "test-message", status: "available", media_type: "image/jpeg", byte_size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), object_path: "synthetic-path" };
beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue(metadata); mocks.load.mockResolvedValue({ arrayBuffer: async () => bytes }); mocks.audit.mockImplementation((input) => input.execute()); });

it("returns image bytes through the SDK multimodal output, not the saved tool result", async () => {
  const tool = createReopenConversationImageTool(context);
  const result = await tool.execute!({ attachmentId }, { toolCallId: "call", messages: [], context: undefined });
  expect(result).toEqual({ attachmentId, messageId: "test-message", mediaType: "image/jpeg" });
  const output = await tool.toModelOutput!({ input: { attachmentId }, output: result as { attachmentId: string; messageId: string | null; mediaType: "image/jpeg" | "image/png" }, toolCallId: "call" });
  expect(output).toMatchObject({ type: "content", value: [{ type: "text" }, { type: "file", mediaType: "image/jpeg", data: { type: "data" } }] });
  expect(mocks.find).toHaveBeenCalledWith("test-user", "test-conversation", attachmentId);
});

it("rejects a foreign conversation before loading the object", async () => {
  mocks.find.mockResolvedValue(null);
  const tool = createReopenConversationImageTool(context);
  await expect(tool.execute!({ attachmentId }, { toolCallId: "call", messages: [], context: undefined })).rejects.toThrow(/unavailable/);
  expect(mocks.load).not.toHaveBeenCalled();
});

it("rejects altered image bytes", async () => {
  mocks.load.mockResolvedValue({ arrayBuffer: async () => Buffer.from("altered") });
  const tool = createReopenConversationImageTool(context);
  const result = await tool.execute!({ attachmentId }, { toolCallId: "call", messages: [], context: undefined });
  await expect(tool.toModelOutput!({ input: { attachmentId }, output: result as { attachmentId: string; messageId: string | null; mediaType: "image/jpeg" | "image/png" }, toolCallId: "call" })).rejects.toThrow(/integrity/);
});
