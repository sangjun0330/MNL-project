import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  redirect("/tools/nurse-calculators?tab=unit-converter");
}
