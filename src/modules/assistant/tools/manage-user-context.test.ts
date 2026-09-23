import { describe, expect, it } from "vitest";

import { assertAssistantConfirmation } from "./manage-user-context";

describe("assistant goal confirmation", () => {
  it("accepts an explicit French confirmation even when apostrophe typography differs", () => {
    expect(() => assertAssistantConfirmation("Je confirme l’objectif", "Je confirme l'objectif")).not.toThrow();
    expect(() => assertAssistantConfirmation("Validé", "Validé")).not.toThrow();
    expect(() => assertAssistantConfirmation("Je confirme, ne change rien", "Je confirme")).not.toThrow();
    expect(() => assertAssistantConfirmation("C'est bon", "C'est bon")).not.toThrow();
  });

  it("rejects a quoted proposal without approval or a correction", () => {
    expect(() => assertAssistantConfirmation("Voici l'objectif proposé", "l'objectif proposé")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Oui, mais je corrige l'objectif", "Oui")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Je ne valide pas", "valide")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Je ne valide", "valide")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Réessaie l'enregistrement", "Réessaie")).toThrow(/confirmation explicite/);
  });
});
