"use client";

import React, { useState, useEffect, type ReactNode } from "react";
import { DiscobolusBackdrop } from "./discobolus-backdrop";
import { DiscobolusTopBar } from "./discobolus-top-bar";
import {
  type DiscobolusVariant,
  getInitialDiscobolusVariant,
} from "./discobolus-types";
import styles from "./discobolus-main-preview.module.css";

export function DiscobolusMainPreview({ children }: { readonly children: ReactNode }) {
  const [variant, setVariant] = useState<DiscobolusVariant>(getInitialDiscobolusVariant);

  useEffect(() => {
    const handleVariantChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ variant: DiscobolusVariant }>;
      if (customEvent.detail?.variant) {
        setVariant(customEvent.detail.variant);
      }
    };
    window.addEventListener("soma-discobolus-change", handleVariantChange);
    return () => window.removeEventListener("soma-discobolus-change", handleVariantChange);
  }, []);

  const handleViewModeChange = (mode: "main" | "landing") => {
    if (mode === "landing") {
      window.location.href = "/?view=landing";
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div
      className={styles.previewWrapper}
      data-has-statue={variant !== "off"}
      data-statue-variant={variant}
    >
      <DiscobolusTopBar
        variant={variant}
        onVariantChange={setVariant}
        viewMode="main"
        onViewModeChange={handleViewModeChange}
      />
      <div className={styles.contentWrapper}>
        <DiscobolusBackdrop
          variant={variant}
          intensity="normal"
          renderMode="hybrid"
          placement="fixed"
        />
        {children}
      </div>
    </div>
  );
}
