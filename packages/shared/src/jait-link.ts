import { safeNotificationLink } from "./notifications.js";

export interface JaitRenderedLink {
  kind: "jait-link";
  href: string;
  label: string;
}

/** Same destination boundary in the tool and UI; model output is untrusted. */
export function parseJaitRenderedLink(value: unknown): JaitRenderedLink | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const href = safeNotificationLink(input.href);
  if (!href || typeof input.href !== "string" || input.href.includes("#")) return null;
  if (typeof input.label !== "string" || Array.from(input.label).some(character => character.charCodeAt(0) < 32)) return null;
  const label = input.label.trim();
  if (!label || label.length > 160) return null;
  return { kind: "jait-link", href, label };
}
