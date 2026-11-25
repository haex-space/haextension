import type { ButtonVariants } from "@/components/shadcn/button";

/** What every icon button of haex-ui takes. The look is the component's; the app names the action. */
export interface UiIconButtonProps {
  /** Names what the button does, for screen readers and the tooltip. */
  label: string;
  size?: "icon" | "icon-sm" | "icon-lg";
  variant?: ButtonVariants["variant"];
  loading?: boolean;
  disabled?: boolean;
  /** Overrides the icon size, for the rare small button (`size-3`). */
  iconClass?: string;
}
