import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge Tailwind class names without conflicts.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
