import { HugeiconsIcon } from "@hugeicons/react"
import {
  Link01Icon,
  SlidersHorizontalIcon,
  CheckmarkBadge01Icon,
  Calendar03Icon,
  TickDouble01Icon,
  SquareLock02Icon,
  Key01Icon,
  ViewIcon,
  Shield01Icon,
  ArrowRight01Icon,
  DiscordIcon,
  Github01Icon,
  Menu01Icon,
  Cancel01Icon,
  Sun03Icon,
  Moon02Icon,
  SparklesIcon,
  FlashIcon,
} from "@hugeicons/core-free-icons"

const ICONS = {
  Link01Icon,
  SlidersHorizontalIcon,
  CheckmarkBadge01Icon,
  Calendar03Icon,
  TickDouble01Icon,
  SquareLock02Icon,
  Key01Icon,
  ViewIcon,
  Shield01Icon,
  ArrowRight01Icon,
  DiscordIcon,
  Github01Icon,
  Menu01Icon,
  Cancel01Icon,
  Sun03Icon,
  Moon02Icon,
  SparklesIcon,
  FlashIcon,
} as const

export type IconName = keyof typeof ICONS

export function Icon({
  name,
  className,
  strokeWidth = 1.8,
}: {
  name: IconName
  className?: string
  strokeWidth?: number
}) {
  return (
    <HugeiconsIcon icon={ICONS[name]} className={className} strokeWidth={strokeWidth} />
  )
}
