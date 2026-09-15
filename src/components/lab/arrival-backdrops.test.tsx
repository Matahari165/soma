import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ArrivalBackdrop, BACKDROP_OPTIONS } from "./arrival-backdrops";

it("exposes only Disco and the selected cloud variant", () => {
  expect(BACKDROP_OPTIONS.map((option) => option.id)).toEqual([
    "disco-large",
    "mont-nuages-user",
  ]);
});

it("renders an immersive layer bounded to the hero", () => {
  const html = renderToStaticMarkup(<ArrivalBackdrop variant="mont-nuages-user" />);
  expect(html).toContain("position:absolute");
  expect(html).toContain("z-index:0");
  expect(html).toContain("arrival-backdrop__fade");
});

it("renders the user-supplied Discobolus photo fully inside the frame", () => {
  const html = renderToStaticMarkup(<ArrivalBackdrop variant="disco-large" />);
  expect(html).toContain("discobole-wide.png");
  expect(html).toContain("arrival-backdrop__image--disco");
});

it("renders the selected user cloud photo", () => {
  const userPhoto = renderToStaticMarkup(<ArrivalBackdrop variant="mont-nuages-user" />);
  expect(userPhoto).toContain("montagnes-nuages-utilisateur-v3.jpg");
  expect(userPhoto).toContain("arrival-backdrop__image--crepuscule");
});
