import { buttonVariants } from "@/components/ui/button"
import { Icon } from "@/components/icon"
import { cn } from "@/lib/utils"
import { DISCORD_INVITE_URL } from "@/lib/content"

export function AddToDiscord({
  className,
  size = "default",
  variant = "primary",
  href = DISCORD_INVITE_URL,
  children = "Add to Discord",
}: {
  className?: string
  size?: "default" | "hero"
  variant?: "primary" | "secondary"
  href?: string
  children?: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        buttonVariants({ variant: variant === "primary" ? "default" : "outline" }),
        "group/cta gap-2",
        variant === "primary" &&
          "shadow-[0_8px_30px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)] hover:shadow-[0_10px_36px_-6px_color-mix(in_oklch,var(--primary)_85%,transparent)]",
        size === "hero" ? "h-12 rounded-xl px-6 text-base" : "h-9 px-4",
        className
      )}
    >
      <Icon name="DiscordIcon" className={size === "hero" ? "size-5" : "size-4"} strokeWidth={2} />
      {children}
      <Icon
        name="ArrowRight01Icon"
        className="size-4 transition-transform group-hover/cta:translate-x-0.5"
      />
    </a>
  )
}
