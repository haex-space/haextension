import type { ClassValue } from "clsx"
import { clsx } from "clsx"
import { DrizzleQueryError } from "drizzle-orm"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Human-readable message from an unknown error value. SDK errors are not
 * always Error instances but may still carry a `message` property.
 * A failed Drizzle statement's own message is the full SQL with all its
 * parameters (mail subjects, addresses); the vault's reason is its cause.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof DrizzleQueryError && err.cause !== undefined) {
    return getErrorMessage(err.cause);
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** Consecutive slices of `items`, each at most `size` long. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const slices: T[][] = [];
  for (let i = 0; i < items.length; i += size) slices.push(items.slice(i, i + size));
  return slices;
}
