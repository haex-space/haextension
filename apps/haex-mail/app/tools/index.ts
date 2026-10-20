import type { ToolHandlers } from "./context";
import { createRuleTools, type RuleToolDeps } from "./rules";

/** Everything the tools need from the stores; each tool file names the part it uses. */
export type ToolDeps = RuleToolDeps;

/**
 * The handlers of every tool haex-mail offers the agent, by the name the manifest declares them
 * under (`haextension/manifest.json`, `tools`). `manifest.test.ts` keeps both lists equal.
 */
export const createTools = (deps: () => Promise<ToolDeps>): ToolHandlers => ({
  ...createRuleTools(deps),
});
