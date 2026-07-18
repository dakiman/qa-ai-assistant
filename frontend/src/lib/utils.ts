import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Radix Select can't use "" as an item value (that's reserved for "no
// selection" / the placeholder), so an explicit "clear back to default
// prompt" choice needs its own sentinel. Shared by the new-feature wizard and
// the feature-detail regenerate dialog's template pickers (B6).
export const NO_TEMPLATE_VALUE = '__none__'
