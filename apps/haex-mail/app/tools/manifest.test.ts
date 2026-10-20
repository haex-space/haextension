import { describe, expect, it } from "vitest";
import manifest from "../../haextension/manifest.json";
import { createTools } from "./index";

/** What each tool may do: read, change, or destructive (the host asks even in "Auto"). */
const EFFECTS: Record<string, "read" | "change" | "destructive"> = {
  list_accounts: "read",
  list_mailboxes: "read",
  find_messages: "read",
  get_message: "read",
  list_rules: "read",
  mark_messages: "change",
  move_messages: "change",
  create_mailbox: "change",
  create_draft: "change",
  remove_rule: "change",
  import_account: "change",
  open_account_setup: "change",
  add_rule: "destructive",
  send_mail: "destructive",
  delete_messages: "destructive",
};

type Schema = {
  type?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: string[];
};
type Tool = {
  name: string;
  title: { de: string; en: string };
  description: string;
  inputSchema: Schema;
  effect: string;
  examples: { de: string[]; en: string[] };
};
const tools = (manifest as unknown as { tools: Tool[] }).tools;
const handlers = createTools(async () => {
  throw new Error("no stores in this test");
});

/** The subset of JSON Schema holzi offers a model (`schema_in_subset`): nothing else is allowed. */
const KEYWORDS = new Set(["type", "description", "properties", "required", "items", "enum"]);
const inSubset = (schema: Schema): boolean =>
  Object.keys(schema).every((k) => KEYWORDS.has(k)) &&
  ["object", "string", "number", "integer", "boolean", "array"].includes(schema.type ?? "") &&
  Object.values(schema.properties ?? {}).every(inSubset) &&
  (schema.items === undefined || inSubset(schema.items));

const propertyNames = (schema: Schema): string[] => [
  ...Object.keys(schema.properties ?? {}),
  ...Object.values(schema.properties ?? {}).flatMap(propertyNames),
  ...(schema.items ? propertyNames(schema.items) : []),
];

describe("the tools declared in the manifest", () => {
  it("follow the format rules of the host (spec 018, manifest-tools)", () => {
    expect(tools.length).toBeLessThanOrEqual(32);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.name, tool.name).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
      for (const language of ["de", "en"] as const) {
        expect(tool.title[language].length, `${tool.name} title ${language}`).toBeGreaterThanOrEqual(1);
        expect(tool.title[language].length).toBeLessThanOrEqual(80);
        expect(tool.examples[language].length, `${tool.name} examples ${language}`).toBeGreaterThanOrEqual(4);
        expect(tool.examples[language].length).toBeLessThanOrEqual(10);
        for (const sentence of tool.examples[language]) {
          expect(sentence.length).toBeGreaterThanOrEqual(1);
          expect(sentence.length).toBeLessThanOrEqual(200);
        }
      }
      expect(tool.description.length).toBeGreaterThanOrEqual(1);
      expect(tool.description.length).toBeLessThanOrEqual(1024);
      expect(tool.inputSchema.type).toBe("object");
      expect(inSubset(tool.inputSchema), `${tool.name} schema subset`).toBe(true);
      expect(["read", "change", "destructive"]).toContain(tool.effect);
    }
  });

  it("have the effect the spec sets: only add_rule, send_mail and delete_messages are destructive", () => {
    for (const tool of tools) {
      expect(tool.effect, tool.name).toBe(EFFECTS[tool.name]);
    }
    const destructive = Object.entries(EFFECTS).filter(([, e]) => e === "destructive").map(([n]) => n);
    expect(destructive.sort()).toEqual(["add_rule", "delete_messages", "send_mail"]);
  });

  it("match the handlers one to one", () => {
    expect(Object.keys(handlers).sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it("take no password as input (spec 019 FR-018)", () => {
    for (const tool of tools) {
      // `passwordItemId` names an entry of the password manager; it is no password.
      const names = propertyNames(tool.inputSchema)
        .map((n) => n.toLowerCase())
        .filter((n) => n !== "passworditemid");
      expect(
        names.filter((n) => n.startsWith("password") || n.includes("secret")),
        tool.name,
      ).toEqual([]);
    }
  });
});
