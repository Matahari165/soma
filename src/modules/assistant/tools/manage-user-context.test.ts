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
    expect(() => assertAssistantConfirmation("Je refuse de confirmer", "confirmer")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Le brouillon contient « je confirme », à relire", "je confirme")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Je valide à condition que la date change", "Je valide")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Oui, modifie d'abord mon objectif", "Oui")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("OK pour l'instant", "OK")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Je confirme provisoirement", "Je confirme")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Oui, on verra", "Oui")).toThrow(/confirmation explicite/);
    expect(() => assertAssistantConfirmation("Je valide, le reste est à revoir", "Je valide")).toThrow(/confirmation explicite/);
  });
});
