import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn — Tailwind 클래스 병합 유틸
 * clsx로 조건부 클래스를 처리하고, tailwind-merge로 중복/충돌 클래스를 자동 해결합니다.
 * 예) cn("px-2 px-4") → "px-4" (충돌 자동 제거)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
