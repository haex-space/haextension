import { computed, toValue, useId, type MaybeRefOrGetter } from "vue";
import { LABEL_BG_VAR } from "./floating-label";

interface LabelledFieldOptions {
  /** The consumer's id; without one, a generated id still ties the label and the error text to the field. */
  id: MaybeRefOrGetter<string | undefined>;
  /** The consumer's aria-describedby, kept next to the error text. */
  describedBy?: MaybeRefOrGetter<string | undefined>;
  error: MaybeRefOrGetter<string | undefined>;
  /** CSS colour of the surface behind the field, used by the label to cover the border. */
  labelBg: MaybeRefOrGetter<string | undefined>;
}

/** Ids and ARIA wiring shared by the floating-label fields UiInput, UiTextarea and UiSelect. */
export function useLabelledField(options: LabelledFieldOptions) {
  const generatedId = useId();
  const fieldId = computed(() => toValue(options.id) ?? generatedId);
  const errorId = `${generatedId}-error`;
  const describedBy = computed(
    () =>
      [toValue(options.describedBy), toValue(options.error) ? errorId : undefined].filter(Boolean).join(" ") ||
      undefined,
  );
  const labelStyle = computed(() => {
    const labelBg = toValue(options.labelBg);
    return labelBg ? { [LABEL_BG_VAR]: labelBg } : undefined;
  });
  return { fieldId, errorId, describedBy, labelStyle };
}
