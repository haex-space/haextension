// Class strings of the floating label shared by UiInput, UiTextarea and UiSelect.
// The label sits on the border of its field. At rest (field empty and not focused) it lies inside
// the field like a placeholder; once the field has focus or a value it moves up onto the border.
// The field must be a `peer` that comes before the label in the DOM; `placeholder=" "` makes
// `:placeholder-shown` tell "empty" from "filled" in CSS alone.

/** Colour of the surface behind the field: the label covers the border with it. Set per field with
 * the `labelBg` prop (any CSS colour), defaults to the page background. */
export const LABEL_BG_VAR = "--ui-label-bg";

export const floatingLabelBase =
  "pointer-events-none absolute z-10 max-w-[calc(100%-1rem)] truncate rounded-sm px-1 " +
  "bg-[var(--ui-label-bg,var(--background))] text-muted-foreground transition-all duration-150";

/** Position and size at rest (inside the field) for a single-line field. */
export const floatingLabelRestSingle = "top-1/2 -translate-y-1/2 text-sm";
/** Position and size at rest for a multi-line field (first line). */
export const floatingLabelRestMulti = "top-[1.125rem] -translate-y-1/2 text-sm";

/** Position and size once floated, reached by focus or by a value (peer state). */
export const floatingLabelFloated = [
  "peer-focus:top-0 peer-focus:left-2 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:font-medium peer-focus:text-primary",
  "peer-not-placeholder-shown:top-0 peer-not-placeholder-shown:left-2 peer-not-placeholder-shown:-translate-y-1/2 peer-not-placeholder-shown:text-xs peer-not-placeholder-shown:font-medium peer-not-placeholder-shown:text-foreground",
].join(" ");

/** The placeholder to put on the field: a single space while a label is shown (so `:placeholder-shown`
 * works), and the real one stays invisible until the field has focus. */
export function labelledPlaceholder(label: string | undefined, placeholder: unknown): string | undefined {
  if (!label) return typeof placeholder === "string" ? placeholder : undefined;
  return typeof placeholder === "string" && placeholder !== "" ? placeholder : " ";
}

/** Class that hides a real placeholder until the field has focus, only while a label is shown. */
export function labelledPlaceholderClass(label: string | undefined): string {
  return label ? "placeholder:text-transparent focus:placeholder:text-muted-foreground" : "";
}
