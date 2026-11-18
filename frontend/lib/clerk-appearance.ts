import type { Appearance } from "@clerk/types";

/** Clerk theming driven by the design tokens in globals.css (no hard-coded colors). */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorBackground: "var(--card)",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorTextOnPrimaryBackground: "var(--primary-foreground)",
    colorInputBackground: "var(--background)",
    colorInputText: "var(--foreground)",
    colorNeutral: "var(--foreground)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--warning)",
    fontFamily: "var(--font-sans)",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full max-w-md shadow-none",
    card: "w-full border border-border shadow-none rounded-3xl",
    headerTitle: "font-semibold tracking-tight",
    formButtonPrimary: "rounded-full shadow-none normal-case font-medium",
    socialButtonsBlockButton: "rounded-full border-border shadow-none",
    formFieldInput: "rounded-xl border-input shadow-none",
    footer: "bg-transparent",
  },
};
