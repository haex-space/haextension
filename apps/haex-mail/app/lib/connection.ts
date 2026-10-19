import type { ConnectionSecurity } from "@haex-space/vault-sdk";

const SECURITIES: readonly string[] = ["tls", "startTls", "none"] satisfies ConnectionSecurity[];

/** A TCP port from a stored text value, or null if it isn't one. */
export const parsePort = (value: string | undefined): number | null => {
  const trimmed = value?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number(trimmed);
  return port >= 1 && port <= 65535 ? port : null;
};

const isConnectionSecurity = (value: string): value is ConnectionSecurity =>
  SECURITIES.includes(value);

/** A connection security setting from a stored text value, or null if unknown. */
export const parseConnectionSecurity = (value: string | undefined): ConnectionSecurity | null =>
  value !== undefined && isConnectionSecurity(value) ? value : null;
