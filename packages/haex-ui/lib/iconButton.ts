import type { ButtonVariants } from "@/components/shadcn/button";

/** The colour an icon button takes on hover and keyboard focus. `none` keeps the plain ghost hover. */
export type UiIconButtonHover = "primary" | "destructive" | "success" | "warning" | "none";

/** Whole class strings, so Tailwind finds them (`@source` covers this folder). */
const HOVER_CLASS: Record<UiIconButtonHover, string> = {
  primary: "hover:bg-primary/10 hover:text-primary focus-visible:text-primary",
  destructive: "hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive",
  success: "hover:bg-success/10 hover:text-success focus-visible:text-success",
  warning: "hover:bg-warning/10 hover:text-warning focus-visible:text-warning",
  none: "",
};

export const iconButtonHoverClass = (hover: UiIconButtonHover): string => HOVER_CLASS[hover];

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
  /** The hover colour; `primary` unless the component says otherwise (`destructive` for delete). */
  hover?: UiIconButtonHover;
}
