import { describe, expect, it } from "vitest";
import { buildPageJob, FIX_INSTRUCTION, PAGE_FORMAT, READ_INSTRUCTION, TEXT_FIX_FORMAT } from "./pageJob";

describe("buildPageJob", () => {
  const job = buildPageJob("QUJD");

  it("reads the working copy, then corrects the texts of the read regions", () => {
    expect(job.steps.map((step) => [step.id, step.needs])).toEqual([
      ["read", ["text", "image"]],
      ["fix", ["text"]],
    ]);
    // Den Aufwand wählt der Nutzer je Modell in holzi; die Erweiterung nennt keinen (FR-006).
    expect(job.steps.every((step) => !("effort" in step))).toBe(true);
    expect(job.steps[0]!.input).toEqual({ images: [{ mimeType: "image/jpeg", data: "QUJD" }] });
    expect(job.steps[0]!.maxOutputTokens).toBe(8192);
    expect(job.steps[1]!.input).toEqual({ from: { step: "read", pointer: "/regions" } });
  });

  it("uses the instructions and formats of the contract", () => {
    expect(job.steps[0]!.instruction).toBe(READ_INSTRUCTION);
    expect(job.steps[1]!.instruction).toBe(FIX_INSTRUCTION);
    expect(job.steps[0]!.format).toBe(PAGE_FORMAT);
    expect(job.steps[1]!.format).toBe(TEXT_FIX_FORMAT);
    expect([PAGE_FORMAT.name, PAGE_FORMAT.version, TEXT_FIX_FORMAT.name, TEXT_FIX_FORMAT.version])
      .toEqual(["page-recognition", 1, "text-fix", 1]);
  });

  it("asks for regions in reading order, boxes from 0 to 1000 and the rotation", () => {
    expect(READ_INSTRUCTION).toContain("reading order");
    expect(READ_INSTRUCTION).toContain("0-1000");
    expect(READ_INSTRUCTION).toContain('"rotation"');
    const properties = (PAGE_FORMAT.schema as { properties: Record<string, { enum?: number[] }> }).properties;
    expect(properties.rotation!.enum).toEqual([0, 90, 180, 270]);
  });
});
