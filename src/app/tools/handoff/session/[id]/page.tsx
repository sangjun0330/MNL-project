import { AppShell } from "@/components/shell/AppShell";
import { HandoffSessionDetailPage } from "@/components/pages/tools/HandoffSessionDetailPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

function safeDecodeURIComponent(input: string) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = await params;
  const id = safeDecodeURIComponent(resolved.id);

  return (
    <AppShell>
      <HandoffSessionDetailPage sessionId={id} />
    </AppShell>
  );
}
