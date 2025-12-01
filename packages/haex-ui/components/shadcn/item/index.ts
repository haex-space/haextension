import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Item } from "./index.vue"
export { default as ItemActions } from "./Actions.vue"
export { default as ItemContent } from "./Content.vue"
export { default as ItemDescription } from "./Description.vue"
export { default as ItemFooter } from "./Footer.vue"
export { default as ItemGroup } from "./Group.vue"
export { default as ItemHeader } from "./Header.vue"
export { default as ItemMedia } from "./Media.vue"
export { default as ItemSeparator } from "./Separator.vue"
export { default as ItemTitle } from "./Title.vue"

export const itemVariants = cva(
  "group/item flex items-center border-b border-border text-sm transition-all hover:bg-accent active:bg-accent/70 [a]:hover:bg-accent/50 [a]:transition-colors duration-100 flex-wrap outline-none focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-1",
  {
    variants: {
      variant: {
        default: "bg-muted/30",
        outline: "border border-border rounded-md bg-muted/30",
        muted: "bg-muted/50",
      },
      size: {
        default: "p-4 gap-4 ",
        sm: "py-3 px-4 gap-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none group-has-[[data-slot=item-description]]/item:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "size-8 border rounded-sm bg-muted [&_svg:not([class*='size-'])]:size-4",
        image:
          "size-10 rounded-sm overflow-hidden [&_img]:size-full [&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export type ItemVariants = VariantProps<typeof itemVariants>
export type ItemMediaVariants = VariantProps<typeof itemMediaVariants>
