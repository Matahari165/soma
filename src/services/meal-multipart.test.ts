import { describe, expect, it } from "vitest";

import { parseMealMultipart } from "./meal-multipart";

describe("meal multipart limits", () => {
  it("rejects a declared body above the hard limit before parsing", async () => {
    const request = new Request("https://soma.example/api/meals/meal/photos", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=unused", "Content-Length": "11" },
      body: "01234567890",
    });
    await expect(parseMealMultipart(request, 10)).rejects.toMatchObject({ code: "too_large" });
  });

  it("parses a bounded multipart body after counting its stream", async () => {
    const form = new FormData();
    form.append("mealId", "meal-1");
    form.append("photos", new File([Uint8Array.from([1, 2, 3])], "meal.jpg", { type: "image/jpeg" }));
    const parsed = await parseMealMultipart(new Request("https://soma.example/api/meals/meal/photos", { method: "POST", body: form }), 1024);
    expect(parsed.get("mealId")).toBe("meal-1");
    expect(parsed.get("photos")).toBeInstanceOf(File);
  });

  it("rejects a chunked body that exceeds the limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    const request = new Request("https://soma.example/api/meals/meal/photos", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=unused" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(parseMealMultipart(request, 5)).rejects.toMatchObject({ code: "too_large" });
  });
});
