import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { GET as getMeals, POST as postMeal } from "./route";
import { DELETE as deleteMeal, GET as getMeal, PATCH as patchMeal } from "./[id]/route";
import { GET as getPhotos, POST as postPhotos } from "./[id]/photos/route";
import { DELETE as deletePhoto, GET as getPhoto, PATCH as patchPhoto } from "./[id]/photos/[photoId]/route";
import { GET as getAnalysis, POST as postAnalysis } from "./[id]/analysis/route";
import * as webMeals from "@/app/api/meals/route";
import * as webMeal from "@/app/api/meals/[id]/route";
import * as webPhotos from "@/app/api/meals/[id]/photos/route";
import * as webPhoto from "@/app/api/meals/[id]/photos/[photoId]/route";
import * as webAnalysis from "@/app/api/meals/[id]/analyze/route";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/app/api/meals/route", () => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock("@/app/api/meals/[id]/route", () => ({ DELETE: vi.fn(), GET: vi.fn(), PATCH: vi.fn() }));
vi.mock("@/app/api/meals/[id]/photos/route", () => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock("@/app/api/meals/[id]/photos/[photoId]/route", () => ({ DELETE: vi.fn(), GET: vi.fn(), PATCH: vi.fn() }));
vi.mock("@/app/api/meals/[id]/analyze/route", () => ({ GET: vi.fn(), POST: vi.fn() }));

const user = { id: "user-1", email: "test@example.com", displayName: "Test" };
const mealContext = { params: Promise.resolve({ id: "meal-1" }) };
const photoContext = { params: Promise.resolve({ id: "meal-1", photoId: "photo-1" }) };

function delegatedResponse(name: string) {
  return NextResponse.json({ delegated: name });
}

describe("native meal API Bearer boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBearerSessionUser).mockResolvedValue(user);
  });

  it("rejects a Web cookie on every native meal route", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    const request = () => new Request("https://soma.example/api/native/v1/meals/meal-1", { headers: { cookie: "soma_session=web-cookie" } });
    const responses = await Promise.all([
      getMeals(request()), postMeal(request()),
      getMeal(request(), mealContext), patchMeal(request(), mealContext), deleteMeal(request(), mealContext),
      getPhotos(request(), mealContext), postPhotos(request(), mealContext),
      getPhoto(request(), photoContext), patchPhoto(request(), photoContext), deletePhoto(request(), photoContext),
      getAnalysis(request(), mealContext), postAnalysis(request(), mealContext),
    ]);

    expect(responses.map((response) => response.status)).toEqual(Array(12).fill(401));
    expect(await responses[0].json()).toEqual({ error: "Authentication required." });
    expect(webMeals.GET).not.toHaveBeenCalled();
    expect(webMeals.POST).not.toHaveBeenCalled();
    expect(webMeal.GET).not.toHaveBeenCalled();
    expect(webMeal.PATCH).not.toHaveBeenCalled();
    expect(webMeal.DELETE).not.toHaveBeenCalled();
    expect(webPhotos.GET).not.toHaveBeenCalled();
    expect(webPhotos.POST).not.toHaveBeenCalled();
    expect(webPhoto.GET).not.toHaveBeenCalled();
    expect(webPhoto.PATCH).not.toHaveBeenCalled();
    expect(webPhoto.DELETE).not.toHaveBeenCalled();
    expect(webAnalysis.GET).not.toHaveBeenCalled();
    expect(webAnalysis.POST).not.toHaveBeenCalled();
  });

  it("delegates collection reads and creates after Bearer authentication", async () => {
    vi.mocked(webMeals.GET).mockResolvedValue(delegatedResponse("meals-get") as never);
    vi.mocked(webMeals.POST).mockResolvedValue(delegatedResponse("meals-post") as never);
    const getRequest = new Request("https://soma.example/api/native/v1/meals?date=2026-09-19", { headers: { authorization: "Bearer token" } });
    const postRequest = new Request("https://soma.example/api/native/v1/meals", { method: "POST", headers: { authorization: "Bearer token" } });

    expect(await (await getMeals(getRequest)).json()).toEqual({ delegated: "meals-get" });
    expect(await (await postMeal(postRequest)).json()).toEqual({ delegated: "meals-post" });
    expect(webMeals.GET).toHaveBeenCalledWith(getRequest);
    expect(webMeals.POST).toHaveBeenCalledWith(postRequest);
  });

  it("delegates meal and photo operations with their route context", async () => {
    vi.mocked(webMeal.GET).mockResolvedValue(delegatedResponse("meal-get") as never);
    vi.mocked(webMeal.PATCH).mockResolvedValue(delegatedResponse("meal-patch") as never);
    vi.mocked(webMeal.DELETE).mockResolvedValue(delegatedResponse("meal-delete") as never);
    vi.mocked(webPhotos.GET).mockResolvedValue(delegatedResponse("photos-get") as never);
    vi.mocked(webPhotos.POST).mockResolvedValue(delegatedResponse("photos-post") as never);
    vi.mocked(webPhoto.GET).mockResolvedValue(delegatedResponse("photo-get") as never);
    vi.mocked(webPhoto.PATCH).mockResolvedValue(delegatedResponse("photo-patch") as never);
    vi.mocked(webPhoto.DELETE).mockResolvedValue(delegatedResponse("photo-delete") as never);
    const request = new Request("https://soma.example/api/native/v1/meals/meal-1", { headers: { authorization: "Bearer token" } });

    await getMeal(request, mealContext);
    await patchMeal(request, mealContext);
    await deleteMeal(request, mealContext);
    await getPhotos(request, mealContext);
    await postPhotos(request, mealContext);
    await getPhoto(request, photoContext);
    await patchPhoto(request, photoContext);
    await deletePhoto(request, photoContext);

    expect(webMeal.GET).toHaveBeenCalledWith(request, mealContext);
    expect(webMeal.PATCH).toHaveBeenCalledWith(request, mealContext);
    expect(webMeal.DELETE).toHaveBeenCalledWith(request, mealContext);
    expect(webPhotos.GET).toHaveBeenCalledWith(request, mealContext);
    expect(webPhotos.POST).toHaveBeenCalledWith(request, mealContext);
    expect(webPhoto.GET).toHaveBeenCalledWith(request, photoContext);
    expect(webPhoto.PATCH).toHaveBeenCalledWith(request, photoContext);
    expect(webPhoto.DELETE).toHaveBeenCalledWith(request, photoContext);
  });

  it("delegates durable analysis enqueue and polling", async () => {
    vi.mocked(webAnalysis.GET).mockResolvedValue(delegatedResponse("analysis-get") as never);
    vi.mocked(webAnalysis.POST).mockResolvedValue(delegatedResponse("analysis-post") as never);
    const request = new Request("https://soma.example/api/native/v1/meals/meal-1/analysis", { headers: { authorization: "Bearer token" } });

    expect(await (await getAnalysis(request, mealContext)).json()).toEqual({ delegated: "analysis-get" });
    expect(await (await postAnalysis(request, mealContext)).json()).toEqual({ delegated: "analysis-post" });
    expect(webAnalysis.GET).toHaveBeenCalledWith(request, mealContext);
    expect(webAnalysis.POST).toHaveBeenCalledWith(request, mealContext);
  });
});
