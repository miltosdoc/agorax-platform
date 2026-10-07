import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap min-h-11 rounded-lg text-sm font-semibold ring-offset-background transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Accent tokens, not a fixed blue: the member's colour theme (shared/theme.ts)
        // swaps --kyanos, and every default button has to follow it.
        default: "bg-kyanos text-accent-foreground hover:bg-kyanos-deep",
        destructive:
          "bg-kata text-white hover:bg-kata/90",
        outline:
          "border border-line bg-surface text-ink hover:border-line-strong hover:bg-sunken",
        secondary:
          "bg-sunken text-ink hover:bg-kyanos-wash",
        ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
        link: "text-kyanos underline-offset-4 hover:underline hover:text-kyanos-deep",
        solid: "bg-surface text-kyanos hover:bg-kyanos-wash",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-11 rounded-md px-3 text-sm",
        lg: "h-12 rounded-lg px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
