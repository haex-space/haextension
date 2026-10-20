import type { MailAddressJson } from "~/database/schemas";

/** "Name <email>, email, …" for headers and quotes. */
export const formatAddressList = (addrs: MailAddressJson[] | undefined) =>
  (addrs ?? []).map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ");

// What the vault's SMTP builder accepts as a bare address; it rejects the
// rest (display names, spaces) with a generic error.
const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+$/;

/** Split at `,`/`;` outside double quotes and angle brackets. */
const splitAddresses = (input: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angled = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted && c === "\\" && i + 1 < input.length) {
      current += c + input[++i];
      continue;
    }
    if (c === '"' && !angled) quoted = !quoted;
    else if (c === "<" && !quoted) angled = true;
    else if (c === ">" && !quoted) angled = false;
    else if ((c === "," || c === ";") && !quoted && !angled) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
};

const unquote = (name: string): string =>
  /^".*"$/.test(name) ? name.slice(1, -1).replace(/\\(.)/g, "$1") : name;

/**
 * Parse a recipient field ("a@x.de, Max <m@x.de>; \"Doe, J\" <j@x.de>").
 * Entries that aren't a valid address come back in `invalid`, verbatim.
 */
export const parseAddressList = (
  input: string,
): { addresses: MailAddressJson[]; invalid: string[] } => {
  const addresses: MailAddressJson[] = [];
  const invalid: string[] = [];
  for (const part of splitAddresses(input)) {
    const named = /^(.*?)\s*<([^<>]*)>$/.exec(part);
    const email = (named ? named[2]! : part).trim();
    if (!EMAIL_RE.test(email)) {
      invalid.push(part);
      continue;
    }
    const name = named ? unquote(named[1]!.trim()) : "";
    addresses.push(name ? { name, email } : { email });
  }
  return { addresses, invalid };
};
