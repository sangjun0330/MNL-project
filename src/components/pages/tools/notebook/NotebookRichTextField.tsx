"use client"

import { useEffect, useRef, type ReactNode } from "react"
import Highlight from "@tiptap/extension-highlight"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import StarterKit from "@tiptap/starter-kit"
import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { Bold as BoldIcon, Code2, Eraser, Highlighter, Italic as ItalicIcon, Link2, Strikethrough } from "lucide-react"
import { cn } from "@/lib/cn"
import { normalizeNotebookLinkHref, plainTextToRichHtml, sanitizeNotebookRichHtml } from "@/lib/notebookRichText"

const MAX_EDITOR_HTML_LENGTH = 24000

type RichTextValue = {
  text: string
  html: string
}

function normalizePlainText(value: string, singleLine = false) {
  const normalized = value.replace(/\r/g, "")
  return singleLine ? normalized.replace(/\n+/g, " ").trim() : normalized.trim()
}

function buildEditorContent(html: string | null | undefined, text: string | null | undefined) {
  const safeHtml = sanitizeNotebookRichHtml(html, MAX_EDITOR_HTML_LENGTH)
  if (safeHtml) return safeHtml
  return plainTextToRichHtml(typeof text === "string" ? text : "")
}

function normalizeStoredHtml(html: string, plainText: string) {
  const safeHtml = sanitizeNotebookRichHtml(html, MAX_EDITOR_HTML_LENGTH)
  if (!plainText.trim()) return ""
  return safeHtml
}

function createSnapshot(value: RichTextValue) {
  return JSON.stringify(value)
}

function promptForLinkHref(currentHref?: string) {
  const nextHref = window.prompt("링크 주소", currentHref || "https://")
  if (nextHref == null) return { action: "cancel" as const, href: "" }
  if (!nextHref.trim()) return { action: "clear" as const, href: "" }
  const normalizedHref = normalizeNotebookLinkHref(nextHref)
  if (!normalizedHref) {
    window.alert("http(s) 또는 mailto 링크만 사용할 수 있습니다.")
    return { action: "invalid" as const, href: "" }
  }
  return { action: "set" as const, href: normalizedHref }
}

export function NotebookRichTextField({
  text,
  html,
  placeholder,
  ariaLabel,
  className,
  editable = true,
  enableSlashMenu = true,
  singleLine = false,
  onChange,
  onDuplicate,
  onRequestSlashMenu,
}: {
  text?: string
  html?: string
  placeholder: string
  ariaLabel: string
  className?: string
  editable?: boolean
  enableSlashMenu?: boolean
  singleLine?: boolean
  onChange: (next: RichTextValue) => void
  onDuplicate?: () => void
  onRequestSlashMenu?: () => void
}) {
  const lastSnapshotRef = useRef(
    createSnapshot({ text: normalizePlainText(text ?? "", singleLine), html: sanitizeNotebookRichHtml(html, MAX_EDITOR_HTML_LENGTH) })
  )
  const initialContentRef = useRef(buildEditorContent(html, text))
  const defaultFormattingState = {
    isBold: false,
    isItalic: false,
    isStrike: false,
    isCode: false,
    isHighlight: false,
    isLink: false,
    canClear: false,
  }

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        orderedList: false,
      }),
      Highlight.configure({ multicolor: false }),
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
        isAllowedUri: (url) => /^(https?:\/\/|mailto:)/i.test(url),
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: initialContentRef.current,
    editable,
    editorProps: {
      attributes: {
        class: cn(
          "notebook-rich-text-editor ProseMirror min-h-[1.6em] w-full whitespace-pre-wrap break-words border-none bg-transparent outline-none",
          "text-inherit",
          !editable && "cursor-default opacity-90",
          className
        ),
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
        "data-notebook-rich-input": "true",
      },
      handleKeyDown(view, event) {
        if (onDuplicate && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
          event.preventDefault()
          onDuplicate()
          return true
        }

        if (singleLine && event.key === "Enter") {
          event.preventDefault()
          return true
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault()
          const nextHref = promptForLinkHref(editor?.getAttributes("link").href)
          if (nextHref.action === "cancel" || nextHref.action === "invalid") return true
          if (nextHref.action === "clear") {
            editor?.chain().focus().extendMarkRange("link").unsetLink().run()
            return true
          }
          editor?.chain().focus().extendMarkRange("link").setLink({ href: nextHref.href }).run()
          return true
        }

        const currentText = normalizePlainText(view.state.doc.textContent, singleLine)
        if (enableSlashMenu && event.key === "/" && !currentText) {
          event.preventDefault()
          onRequestSlashMenu?.()
          return true
        }

        return false
      },
    },
    onUpdate({ editor: nextEditor }) {
      const nextText = normalizePlainText(nextEditor.getText({ blockSeparator: singleLine ? " " : "\n" }), singleLine)
      const nextHtml = normalizeStoredHtml(nextEditor.getHTML(), nextText)
      const snapshot = createSnapshot({ text: nextText, html: nextHtml })
      if (snapshot === lastSnapshotRef.current) return
      lastSnapshotRef.current = snapshot
      onChange({ text: nextText, html: nextHtml })
    },
  })

  const formattingState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      isBold: currentEditor?.isActive("bold") ?? false,
      isItalic: currentEditor?.isActive("italic") ?? false,
      isStrike: currentEditor?.isActive("strike") ?? false,
      isCode: currentEditor?.isActive("code") ?? false,
      isHighlight: currentEditor?.isActive("highlight") ?? false,
      isLink: currentEditor?.isActive("link") ?? false,
      canClear: currentEditor?.can().chain().focus().unsetAllMarks().run() ?? false,
    }),
  }) ?? defaultFormattingState

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editable, editor])

  useEffect(() => {
    if (!editor) return
    const nextValue = {
      text: normalizePlainText(text ?? "", singleLine),
      html: sanitizeNotebookRichHtml(html, MAX_EDITOR_HTML_LENGTH),
    }
    const nextSnapshot = createSnapshot(nextValue)
    if (nextSnapshot === lastSnapshotRef.current) return

    lastSnapshotRef.current = nextSnapshot
    const nextContent = buildEditorContent(nextValue.html, nextValue.text)
    const currentText = normalizePlainText(editor.getText({ blockSeparator: singleLine ? " " : "\n" }), singleLine)
    const currentHtml = normalizeStoredHtml(editor.getHTML(), currentText)

    if (currentText === nextValue.text && currentHtml === nextValue.html) return
    editor.commands.setContent(nextContent, { emitUpdate: false })
  }, [editor, html, singleLine, text])

  if (!editor) {
    return (
      <>
        <div className={cn("min-h-[1.6em] whitespace-pre-wrap break-words text-inherit", className)}>
          {text || ""}
        </div>
        <style jsx global>{`
          .notebook-rich-text-editor p {
            margin: 0;
          }
          .notebook-rich-text-editor p + p {
            margin-top: 0.5em;
          }
          .notebook-rich-text-editor .is-editor-empty:first-child::before {
            color: rgb(203 213 225);
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }
          .notebook-rich-text-editor a {
            color: var(--rnest-accent);
            text-decoration: underline;
            text-underline-offset: 2px;
          }
          .notebook-rich-text-editor mark {
            background: rgba(253, 224, 71, 0.45);
            border-radius: 0.25rem;
            padding: 0 0.1em;
          }
          .notebook-rich-text-editor code {
            background: rgba(15, 23, 42, 0.07);
            border-radius: 0.35rem;
            font-size: 0.94em;
            padding: 0.08em 0.28em;
          }
        `}</style>
      </>
    )
  }

  return (
    <>
      {editable && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: currentEditor, state }) =>
            currentEditor.isEditable &&
            !state.selection.empty &&
            currentEditor.state.doc.textBetween(state.selection.from, state.selection.to, " ").trim().length > 0
          }
          className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white/95 p-1 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur"
        >
          <ToolbarButton
            active={formattingState.isBold}
            label="굵게"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <BoldIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={formattingState.isItalic}
            label="기울임"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <ItalicIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={formattingState.isStrike}
            label="취소선"
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={formattingState.isCode}
            label="코드"
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={formattingState.isHighlight}
            label="형광펜"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <Highlighter className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={formattingState.isLink}
            label="링크"
            onClick={() => {
              const nextHref = promptForLinkHref(editor.getAttributes("link").href)
              if (nextHref.action === "cancel" || nextHref.action === "invalid") return
              if (nextHref.action === "clear") {
                editor.chain().focus().extendMarkRange("link").unsetLink().run()
                return
              }
              editor.chain().focus().extendMarkRange("link").setLink({ href: nextHref.href }).run()
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={false}
            disabled={!formattingState.canClear}
            label="서식 지우기"
            onClick={() => editor.chain().focus().unsetAllMarks().run()}
          >
            <Eraser className="h-3.5 w-3.5" />
          </ToolbarButton>
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />

      <style jsx global>{`
        .notebook-rich-text-editor p {
          margin: 0;
        }
        .notebook-rich-text-editor p + p {
          margin-top: 0.5em;
        }
        .notebook-rich-text-editor .is-editor-empty:first-child::before {
          color: rgb(203 213 225);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .notebook-rich-text-editor a {
          color: var(--rnest-accent);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .notebook-rich-text-editor mark {
          background: rgba(253, 224, 71, 0.45);
          border-radius: 0.25rem;
          padding: 0 0.1em;
        }
        .notebook-rich-text-editor code {
          background: rgba(15, 23, 42, 0.07);
          border-radius: 0.35rem;
          font-size: 0.94em;
          padding: 0.08em 0.28em;
        }
      `}</style>
    </>
  )
}

function ToolbarButton({
  active,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-xl text-gray-500 transition-colors",
        active ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]" : "hover:bg-gray-100 hover:text-gray-700",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      {children}
    </button>
  )
}
