import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { GET as getExport } from "./export/route";
import { GET as getArchive } from "./archive/route";
import * as webExport from "@/app/api/account/export/route";
import * as webArchive from "@/app/api/account/archive/route";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/app/api/account/export/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/account/archive/route", () => ({ GET: vi.fn() }));

describe("native account export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBearerSessionUser).mockResolvedValue({ id: "user", email: null, displayName: "Test" });
  });

  it("rejects cookie-only access", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    expect((await getExport()).status).toBe(401);
    expect(webExport.GET).not.toHaveBeenCalled();
  });

  it("rewrites downloadable links to the versioned native boundary", async () => {
    vi.mocked(webExport.GET).mockResolvedValue(NextResponse.json({
      archiveDownloads: [{ signedUrl: "/api/account/archive?key=archive.json" }],
      mealPhotoDownloads: [{ path: "/api/meals/meal/photos/photo" }],
    }));
    const body = await (await getExport()).json();
    expect(body.archiveDownloads[0].signedUrl).toBe("/api/native/v1/account/archive?key=archive.json");
    expect(body.mealPhotoDownloads[0].path).toBe("/api/native/v1/meals/meal/photos/photo");
  });

  it("guards and delegates archive downloads", async () => {
    vi.mocked(webArchive.GET).mockResolvedValue(new NextResponse("archive"));
    const request = new Request("https://soma.example/api/native/v1/account/archive?key=archive.json");
    expect((await getArchive(request)).status).toBe(200);
    expect(webArchive.GET).toHaveBeenCalledWith(request);
  });
});
