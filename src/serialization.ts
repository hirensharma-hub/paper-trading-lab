import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return null;
      return Object.is(item, -0) ? 0 : item;
    }
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function sha256CanonicalJson(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

export function sanitizeArtifact<T>(value: T): T {
  if (typeof value === "number" && !Number.isFinite(value)) return null as T;
  if (Array.isArray(value)) return value.map((child) => sanitizeArtifact(child)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, sanitizeArtifact(child)])) as T;
  return value;
}

export function assertFiniteArtifact(value: unknown, path = "artifact"): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`NON_FINITE_ARTIFACT:${path}`);
  if (Array.isArray(value)) value.forEach((child, index) => assertFiniteArtifact(child, `${path}[${index}]`));
  else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, child]) => assertFiniteArtifact(child, `${path}.${key}`));
}
