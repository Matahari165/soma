import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ArrivalBackdrop, BACKDROP_OPTIONS } from "./arrival-backdrops";

it("exposes Disco large and three complementary mountain variants", () => {
  expect(BACKDROP_OPTIONS.map((option) => option.id)).toEqual([
    "disco-large",
    "mont-cimes",
    "mont-panorama",
    "mont-crepuscule",
  ]);
});

it("renders an immersive layer bounded to the hero", () => {
  const html = renderToStaticMarkup(<ArrivalBackdrop variant="mont-panorama" />);
  expect(html).toContain("position:absolute");
  expect(html).toContain("z-index:0");
  expect(html).toContain("arrival-backdrop__fade");
});

it("renders the user-supplied Discobolus photo fully inside the frame", () => {
  const html = renderToStaticMarkup(<ArrivalBackdrop variant="disco-large" />);
  expect(html).toContain("discobole-wide.png");
  expect(html).toContain("arrival-backdrop__image--disco");
});

it("renders wide mountain photos in monochrome with a contrast veil", () => {
  const panorama = renderToStaticMarkup(<ArrivalBackdrop variant="mont-panorama" />);
  expect(panorama).toContain("montagnes-altitude-v2.png");
  expect(panorama).toContain("arrival-backdrop__image--panorama");
  const crepuscule = renderToStaticMarkup(<ArrivalBackdrop variant="mont-crepuscule" />);
  expect(crepuscule).toContain("montagnes-nuages-v2.png");
  expect(crepuscule).toContain("arrival-backdrop__image--crepuscule");
});
