import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MealsInitialLoadError } from "./meals-initial-load-error";

describe("MealsInitialLoadError", () => {
  it("explains that a meal load failure is not an empty day", () => {
    const html = renderToStaticMarkup(<MealsInitialLoadError kind="meals" />);

    expect(html).toContain('role="alert"');
    expect(html).toContain("Unable to load meals");
    expect(html).toContain("currently unavailable");
    expect(html).toContain(">Try again</button>");
  });

  it("keeps a nutrition failure separate from the meal journal", () => {
    const html = renderToStaticMarkup(<MealsInitialLoadError kind="nutrition" />);

    expect(html).toContain("Nutritional history unavailable");
    expect(html).toContain("Meals remain available");
  });
});
