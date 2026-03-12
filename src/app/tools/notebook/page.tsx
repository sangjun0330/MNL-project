import type { Metadata } from "next"
import { ToolNotebookPage } from "@/components/pages/tools/ToolNotebookPage"
import { AppShell } from "@/components/shell/AppShell"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function Page() {
  return (
    <AppShell>
      <ToolNotebookPage />
    </AppShell>
  )
}
