# Tiptap 메모 에디터 통합 기획서

> **프로젝트**: RNest — Shift Body Battery
> **대상 기능**: `/tools/notebook` 메모(Memo) 편집기
> **작성일**: 2026-03-13
> **브랜치**: `claude/tiptap-notes-planning-3cTaK`
> **작성 목적**: 현재 plain-text 블록 입력 방식을 Tiptap 기반 리치 텍스트 에디터로 교체하기 위한 설계·구현 계획서

---

## 목차

1. [현황 분석](#1-현황-분석)
2. [목표 및 핵심 요구사항](#2-목표-및-핵심-요구사항)
3. [Tiptap 선택 근거](#3-tiptap-선택-근거)
4. [Tiptap 패키지 구성](#4-tiptap-패키지-구성)
5. [데이터 모델 설계](#5-데이터-모델-설계)
6. [블록 타입 ↔ Tiptap 노드 매핑](#6-블록-타입--tiptap-노드-매핑)
7. [에디터 아키텍처](#7-에디터-아키텍처)
8. [컴포넌트 설계](#8-컴포넌트-설계)
9. [인라인 서식 (Marks) 설계](#9-인라인-서식-marks-설계)
10. [슬래시 커맨드 (`/` 메뉴)](#10-슬래시-커맨드--메뉴)
11. [데이터 직렬화 · 역직렬화](#11-데이터-직렬화--역직렬화)
12. [기존 데이터 마이그레이션](#12-기존-데이터-마이그레이션)
13. [암호화(잠금 메모) 호환성](#13-암호화잠금-메모-호환성)
14. [첨부파일 · 이미지 블록 처리](#14-첨부파일--이미지-블록-처리)
15. [자동 저장 · Supabase 동기화](#15-자동-저장--supabase-동기화)
16. [모바일 · PWA 대응](#16-모바일--pwa-대응)
17. [성능 최적화](#17-성능-최적화)
18. [보안 고려사항](#18-보안-고려사항)
19. [CSP 업데이트](#19-csp-업데이트)
20. [단계별 구현 로드맵](#20-단계별-구현-로드맵)
21. [리스크 분석 및 대응](#21-리스크-분석-및-대응)
22. [테스트 전략](#22-테스트-전략)
23. [결론](#23-결론)

---

## 1. 현황 분석

### 1.1 기존 에디터 구조

현재 `ToolNotebookPage.tsx`(약 159KB)는 다음과 같이 동작한다:

```
각 RNestMemoBlock
  ├── type: paragraph | heading | bulleted | ...
  ├── text: string  ← <input> 또는 <textarea>로 직접 편집
  └── (블록별 추가 필드: checked, table, attachmentId, ...)
```

- 모든 텍스트 편집은 native `<input type="text">` / `<textarea>` 로 처리
- **인라인 서식 없음** — Bold, Italic, 밑줄, 하이라이트 등 불가
- 각 블록은 개별 DOM input element로 분리되어 있어 **블록 간 텍스트 흐름 없음**
- 키보드 단축키(`handleEditorKeyDown`)를 수동 구현
- 블록당 최대 4,000자 제한

### 1.2 현재 블록 타입 목록 (13종)

| 타입 | 설명 | 현재 입력 방식 |
|------|------|---------------|
| `paragraph` | 일반 문단 | `<textarea>` |
| `heading` | 제목 | `<input>` |
| `bulleted` | 글머리 기호 목록 | `<input>` |
| `numbered` | 번호 목록 | `<input>` |
| `checklist` | 체크리스트 | `<input>` + checkbox |
| `callout` | 콜아웃 박스 | `<textarea>` |
| `quote` | 인용구 | `<textarea>` |
| `toggle` | 토글 (접기/펼치기) | `<input>` + 내용 `<textarea>` |
| `divider` | 구분선 | 텍스트 없음 |
| `table` | 인라인 표 | 셀별 `<input>` |
| `bookmark` | URL 북마크 | URL `<input>` + 설명 `<input>` |
| `image` | 이미지 | 캡션 `<input>` |
| `attachment` | 파일 첨부 | 설명 `<input>` |

### 1.3 현재 구조의 한계

1. **인라인 서식 불가** — 블록 단위 하이라이트(배경색)만 존재, 인라인 Bold/Italic/밑줄 없음
2. **블록 간 커서 이동이 어색** — Tab/Enter/Arrow키를 수동으로 처리해야 함
3. **붙여넣기 서식 유실** — 외부에서 복사한 서식 있는 텍스트가 plain text로 변환됨
4. **모바일 한국어 IME 문제** — `onCompositionStart/End` 를 수동 처리 필요
5. **확장성 부족** — 새 블록 타입 추가 시 대규모 수정 필요
6. **접근성 불량** — ARIA role, aria-label 등 수동 구현 필요

---

## 2. 목표 및 핵심 요구사항

### 2.1 기능 요구사항

| 우선순위 | 요구사항 |
|---------|---------|
| P0 (필수) | 기존 13종 블록 타입 100% 유지 |
| P0 (필수) | 기존 저장 데이터(`RNestMemoBlock[]`)와 완전 호환 |
| P0 (필수) | 자동 저장 · Supabase 동기화 유지 |
| P0 (필수) | 잠금 메모(PBKDF2-AES-GCM) 동작 유지 |
| P0 (필수) | 모바일(PWA) 정상 동작, 한국어 IME 완벽 지원 |
| P1 (중요) | 인라인 Bold / Italic / Underline / Strikethrough |
| P1 (중요) | 인라인 하이라이트 (6가지 색상 유지) |
| P1 (중요) | `/` 슬래시 커맨드로 블록 타입 변환 |
| P1 (중요) | 드래그앤드롭 블록 순서 변경 |
| P2 (선택) | 인라인 코드 서식 |
| P2 (선택) | 링크(anchor) 삽입 |
| P2 (선택) | 선택 영역 플로팅 툴바 |

### 2.2 비기능 요구사항

- **번들 크기**: Tiptap 관련 번들 증가분 < 150KB gzipped
- **초기 렌더링**: 에디터 첫 렌더 < 200ms (LCP 영향 없음)
- **자동 저장 딜레이**: 500ms debounce 유지
- **오프라인**: localStorage 기반 동작 유지 (PWA 오프라인 지원)
- **TypeScript strict**: 모든 신규 코드 타입 안전성 보장

---

## 3. Tiptap 선택 근거

### 3.1 Tiptap vs 대안 비교

| 항목 | **Tiptap v2** | Slate.js | Quill | Lexical |
|------|-------------|----------|-------|---------|
| React 19 지원 | ✅ 공식 지원 | ⚠️ 커뮤니티 패치 필요 | ❌ React 미지원 | ✅ Meta 공식 |
| Next.js 15 SSR | ✅ `use client` 분리 | ⚠️ 복잡 | ❌ SSR 불안정 | ✅ |
| 커스텀 노드 | ✅ 매우 유연 | ✅ 유연 | ⚠️ 제한적 | ✅ 유연 |
| ProseMirror 기반 | ✅ (안정적) | ❌ 독자 구현 | ✅ | ❌ |
| TypeScript | ✅ 일급 지원 | ⚠️ 타입 불완전 | ⚠️ | ✅ |
| 번들 크기 | ~95KB gz | ~120KB gz | ~40KB gz | ~60KB gz |
| 한국어 IME | ✅ ProseMirror 검증 | ⚠️ 이슈 보고 있음 | ⚠️ | ✅ |
| 문서화 | ✅ 풍부 | ⚠️ 보통 | ✅ | ⚠️ 부족 |
| 라이선스 | MIT (core) | MIT | BSD-3 | MIT |

### 3.2 선택 결론

**Tiptap v2** 를 선택한다.

- ProseMirror 기반으로 한국어 IME 안정성 검증됨
- React 19, Next.js 15 공식 지원
- 커스텀 노드(블록 타입) 확장이 직관적
- `@tiptap/extension-*` 에코시스템으로 필요한 기능 선택적 도입 가능
- 기존 block 배열 → ProseMirror JSON 변환이 명확하게 가능

---

## 4. Tiptap 패키지 구성

### 4.1 설치 패키지 목록

```bash
# 코어
npm install @tiptap/react @tiptap/pm @tiptap/core

# 기본 확장 (스타터킷 대신 개별 설치로 번들 최소화)
npm install @tiptap/extension-document
npm install @tiptap/extension-paragraph
npm install @tiptap/extension-text
npm install @tiptap/extension-heading
npm install @tiptap/extension-bullet-list
npm install @tiptap/extension-ordered-list
npm install @tiptap/extension-list-item
npm install @tiptap/extension-task-list
npm install @tiptap/extension-task-item
npm install @tiptap/extension-blockquote
npm install @tiptap/extension-horizontal-rule
npm install @tiptap/extension-hard-break
npm install @tiptap/extension-history

# 인라인 서식 Marks
npm install @tiptap/extension-bold
npm install @tiptap/extension-italic
npm install @tiptap/extension-underline
npm install @tiptap/extension-strike
npm install @tiptap/extension-code
npm install @tiptap/extension-highlight
npm install @tiptap/extension-link

# 플레이스홀더
npm install @tiptap/extension-placeholder

# 글자 수 세기
npm install @tiptap/extension-character-count
```

> **참고**: `@tiptap/starter-kit`은 불필요한 확장을 포함하므로 개별 설치 방식을 채택한다.
> 커스텀 노드(callout, toggle, table, bookmark, image, attachment)는 직접 구현한다.

### 4.2 커스텀 확장 목록

```
src/lib/tiptap/
├── extensions/
│   ├── CalloutNode.ts         # 콜아웃 블록
│   ├── ToggleNode.ts          # 토글 블록 (접기/펼치기)
│   ├── RNestTableNode.ts      # 2-column 인라인 표 (기존 table 블록)
│   ├── BookmarkNode.ts        # URL 북마크
│   ├── ImageNode.ts           # 이미지 (첨부 기반)
│   ├── AttachmentNode.ts      # 파일 첨부
│   ├── HighlightMark.ts       # 6색 하이라이트 (확장)
│   └── SlashCommand.ts        # / 슬래시 커맨드
├── serializer/
│   ├── blockArrayToTiptap.ts  # RNestMemoBlock[] → TiptapJSON
│   └── tiptapToBlockArray.ts  # TiptapJSON → RNestMemoBlock[]
└── hooks/
    └── useTiptapEditor.ts     # 에디터 인스턴스 훅
```

---

## 5. 데이터 모델 설계

### 5.1 기존 데이터 모델 유지 원칙

**기존 `RNestMemoBlock[]` 배열 구조를 그대로 유지한다.**

Tiptap은 내부적으로 ProseMirror JSON을 사용하지만, Supabase에 저장할 때는 반드시 기존 `RNestMemoBlock[]` 형태로 직렬화하여 저장한다. 이로써:

1. 데이터베이스 스키마 변경 불필요
2. 기존 사용자 데이터와 완전 호환
3. 롤백 시에도 기존 에디터로 즉시 복구 가능

### 5.2 에디터 내부 상태 (ProseMirror JSON)

에디터가 편집 중일 때의 내부 표현:

```typescript
// Tiptap/ProseMirror JSON (에디터 내부 상태)
type TiptapDoc = {
  type: "doc"
  content: TiptapNode[]
}

type TiptapNode = {
  type: string           // "paragraph", "heading", "bulletList", ...
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: TiptapMark[]
}

type TiptapMark = {
  type: string           // "bold", "italic", "highlight", ...
  attrs?: Record<string, unknown>
}
```

### 5.3 인라인 서식을 위한 `RNestMemoBlock` 확장

기존 `text: string` 필드에 인라인 마크업을 저장해야 한다.
**전략: 인라인 서식은 별도 `richText` 필드에 TiptapJSON 형태로 저장**

```typescript
// notebook.ts 에 추가될 타입 (하위 호환)
export type RNestMemoBlock = {
  id: string
  type: RNestMemoBlockType
  text?: string                    // 기존: plain text (하위 호환 유지)
  richText?: TiptapInlineContent[] // 신규: 인라인 서식 포함 content
  detailText?: string              // 기존 toggle/bookmark용
  richDetailText?: TiptapInlineContent[] // 신규: toggle 내용 서식 포함
  // ... 나머지 기존 필드 유지
}

// Tiptap inline content node
export type TiptapInlineContent = {
  type: "text" | "hardBreak"
  text?: string
  marks?: Array<{
    type: "bold" | "italic" | "underline" | "strike" | "code" | "highlight" | "link"
    attrs?: Record<string, unknown>
  }>
}
```

### 5.4 직렬화 규칙

```
저장 시 (Tiptap → Block):
  - richText 필드에 TiptapInlineContent[] 저장
  - text 필드에는 plain text fallback 저장 (하위 호환)

로드 시 (Block → Tiptap):
  - richText 필드가 있으면 → richText 기반으로 TiptapJSON 생성
  - richText 필드가 없으면 → text 기반으로 plain text TiptapJSON 생성 (기존 데이터 자동 지원)
```

### 5.5 블록당 글자 수 제한 유지

- 기존 `MAX_BLOCK_TEXT_LENGTH = 4000` 유지
- `@tiptap/extension-character-count`를 블록별로 적용 (단, 퍼포먼스 이슈로 문서 전체에 한 번만 적용)
- 문서 전체 character limit: `MAX_BLOCKS * MAX_BLOCK_TEXT_LENGTH = 64 * 4000 = 256,000`자

---

## 6. 블록 타입 ↔ Tiptap 노드 매핑

### 6.1 매핑 테이블

| 기존 블록 타입 | Tiptap 노드 타입 | 구현 방식 | 서식 지원 |
|-------------|----------------|---------|---------|
| `paragraph` | `paragraph` | 기본 확장 | ✅ 인라인 서식 전체 |
| `heading` | `heading` (level: 2) | 기본 확장 | ✅ Bold/Italic |
| `bulleted` | `bulletList > listItem > paragraph` | 기본 확장 | ✅ 인라인 서식 전체 |
| `numbered` | `orderedList > listItem > paragraph` | 기본 확장 | ✅ 인라인 서식 전체 |
| `checklist` | `taskList > taskItem > paragraph` | 기본 확장 | ✅ 인라인 서식 전체 |
| `callout` | `callout` | **커스텀 노드** | ✅ 인라인 서식 전체 |
| `quote` | `blockquote > paragraph` | 기본 확장 | ✅ 인라인 서식 전체 |
| `toggle` | `toggle` | **커스텀 노드** | ✅ 제목+내용 서식 |
| `divider` | `horizontalRule` | 기본 확장 | ❌ (텍스트 없음) |
| `table` | `rnestTable` | **커스텀 노드** | ⚠️ 셀 내 plain text |
| `bookmark` | `bookmark` | **커스텀 노드** | ❌ (URL 입력) |
| `image` | `rnestImage` | **커스텀 노드** | ❌ (캡션만) |
| `attachment` | `rnestAttachment` | **커스텀 노드** | ❌ (설명만) |

### 6.2 문서 구조 (Top-level Nodes)

Tiptap의 `Document` 노드는 기본적으로 블록 노드만을 직접 자식으로 허용한다.
아래와 같이 최상위 노드 구조를 설계한다:

```
doc
├── paragraph
├── heading (level=2)
├── bulletList
│   └── listItem
│       └── paragraph
├── orderedList
│   └── listItem
│       └── paragraph
├── taskList
│   └── taskItem (attrs: { checked: boolean })
│       └── paragraph
├── blockquote
│   └── paragraph
├── callout (커스텀)
│   └── paragraph
├── toggle (커스텀)
│   ├── toggleSummary → paragraph
│   └── toggleContent → paragraph*
├── horizontalRule
├── rnestTable (커스텀)
│   └── rnestTableRow (attrs: { left, right })
├── bookmark (커스텀, leaf node)
├── rnestImage (커스텀, leaf node)
└── rnestAttachment (커스텀, leaf node)
```

---

## 7. 에디터 아키텍처

### 7.1 전체 데이터 흐름

```
┌─────────────────────────────────────────────────────────┐
│                   ToolNotebookPage                       │
│                                                         │
│  Zustand Store (memo.documents)                         │
│        │                                                │
│        ▼                                                │
│  RNestMemoDocument                                      │
│    └── blocks: RNestMemoBlock[]                         │
│              │                                          │
│    ┌─────────▼──────────┐                               │
│    │  blockArrayToTiptap │  ← 로드 시 변환               │
│    └─────────┬──────────┘                               │
│              │                                          │
│    ┌─────────▼──────────┐                               │
│    │   TiptapEditor      │  ← 편집 (ProseMirror)         │
│    │   (EditorContent)   │                               │
│    └─────────┬──────────┘                               │
│              │ onUpdate (debounce 500ms)                 │
│    ┌─────────▼──────────┐                               │
│    │  tiptapToBlockArray │  ← 저장 시 변환               │
│    └─────────┬──────────┘                               │
│              │                                          │
│    Zustand Store 업데이트 → localStorage 저장             │
│              │                                          │
│    CloudNotebookSync → Supabase 동기화                   │
└─────────────────────────────────────────────────────────┘
```

### 7.2 에디터 인스턴스 관리

- 에디터는 **문서(document) 단위**로 한 개만 마운트한다
- 문서 전환 시: `editor.commands.setContent(newTiptapJSON)` 또는 컴포넌트 key 변경으로 재마운트
- 에디터가 마운트되지 않은 상태(목록 화면)에서는 블록 배열로만 동작

```typescript
// src/lib/tiptap/hooks/useTiptapEditor.ts
export function useTiptapEditor(doc: RNestMemoDocument | null) {
  const editor = useEditor({
    extensions: getRNestExtensions(),
    content: doc ? blockArrayToTiptap(doc.blocks) : null,
    editorProps: {
      attributes: {
        class: "rnest-editor outline-none",
        spellcheck: "false", // 한국어 red underline 방지
      },
    },
    onUpdate: ({ editor }) => {
      debouncedSave(editor.getJSON())
    },
  })

  // 문서 전환 시 컨텐츠 교체
  useEffect(() => {
    if (editor && doc) {
      editor.commands.setContent(blockArrayToTiptap(doc.blocks))
    }
  }, [doc?.id]) // doc.id 변경 시에만 실행

  return editor
}
```

### 7.3 확장 등록 함수

```typescript
// src/lib/tiptap/extensions/index.ts
export function getRNestExtensions() {
  return [
    Document,
    Paragraph,
    Text,
    Heading.configure({ levels: [2] }), // heading level 2만 사용
    BulletList,
    OrderedList,
    ListItem,
    TaskList,
    TaskItem.configure({ nested: false }),
    Blockquote,
    HorizontalRule,
    HardBreak,
    History,
    Bold,
    Italic,
    Underline,
    Strike,
    Code,
    RNestHighlight,    // 커스텀: 6색 하이라이트
    Link.configure({ openOnClick: false }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "heading") return "제목을 입력하세요..."
        return "내용을 입력하거나 '/'를 눌러 블록을 추가하세요"
      },
      emptyEditorClass: "is-editor-empty",
    }),
    CharacterCount,
    CalloutNode,
    ToggleNode,
    RNestTableNode,
    BookmarkNode,
    RNestImageNode,
    RNestAttachmentNode,
    SlashCommand,
  ]
}
```

---

## 8. 컴포넌트 설계

### 8.1 신규 파일 구조

```
src/
├── lib/
│   └── tiptap/
│       ├── extensions/
│       │   ├── index.ts               # getRNestExtensions()
│       │   ├── CalloutNode.ts
│       │   ├── ToggleNode.ts
│       │   ├── RNestTableNode.ts
│       │   ├── BookmarkNode.ts
│       │   ├── RNestImageNode.ts
│       │   ├── RNestAttachmentNode.ts
│       │   ├── RNestHighlight.ts
│       │   └── SlashCommand.ts
│       ├── serializer/
│       │   ├── blockArrayToTiptap.ts
│       │   └── tiptapToBlockArray.ts
│       └── hooks/
│           └── useTiptapEditor.ts
└── components/
    └── tiptap/
        ├── RNestEditor.tsx             # 에디터 메인 컴포넌트
        ├── EditorToolbar.tsx           # 상단 서식 툴바
        ├── FloatingToolbar.tsx         # 선택 영역 플로팅 툴바
        ├── SlashCommandMenu.tsx        # / 슬래시 메뉴 UI
        ├── nodes/
        │   ├── CalloutNodeView.tsx     # 콜아웃 React 렌더러
        │   ├── ToggleNodeView.tsx      # 토글 React 렌더러
        │   ├── RNestTableNodeView.tsx  # 표 React 렌더러
        │   ├── BookmarkNodeView.tsx    # 북마크 React 렌더러
        │   ├── ImageNodeView.tsx       # 이미지 React 렌더러
        │   └── AttachmentNodeView.tsx  # 첨부 React 렌더러
        └── editor.css                  # 에디터 전용 스타일
```

### 8.2 `RNestEditor` 컴포넌트 인터페이스

```typescript
// src/components/tiptap/RNestEditor.tsx
interface RNestEditorProps {
  doc: RNestMemoDocument
  readOnly?: boolean        // 잠금 메모 읽기 전용
  onBlocksChange: (blocks: RNestMemoBlock[]) => void  // 변경 콜백
  onAddAttachment: (kind: RNestMemoAttachmentKind) => void
  className?: string
}
```

### 8.3 기존 `ToolNotebookPage.tsx` 수정 방향

1. 기존 블록 렌더링 파트(`renderBlock`, `BlockEditor` 등)를 `<RNestEditor>` 컴포넌트로 교체
2. 블록 CRUD 로직(addBlock, deleteBlock 등)을 `onBlocksChange` 콜백으로 단순화
3. 키보드 단축키 핸들러(`handleEditorKeyDown`) 제거 — Tiptap이 담당
4. 블록별 character count UI는 에디터 푸터에 전체 count로 대체

### 8.4 `EditorToolbar` 컴포넌트

```typescript
// 에디터 상단 툴바 (선택적 표시)
interface EditorToolbarProps {
  editor: Editor
}

// 툴바 버튼 그룹
// [Bold] [Italic] [Underline] [Strike] [Code] | [Highlight▼] [Link] | [H2] [•] [1.] [✓]
```

### 8.5 `FloatingToolbar` 컴포넌트

텍스트 선택 시 자동으로 나타나는 플로팅 툴바:

```typescript
// Tippy.js (Tiptap이 의존) 기반 버블 메뉴
// 조건: 텍스트 선택 시 & readOnly 아닐 때
// 버튼: Bold / Italic / Underline / Highlight▼ / Link
```

---

## 9. 인라인 서식 (Marks) 설계

### 9.1 RNestHighlight 커스텀 Mark

기존 블록 단위 `highlight` 색상을 인라인 서식으로도 지원하도록 확장:

```typescript
// src/lib/tiptap/extensions/RNestHighlight.ts
import Highlight from "@tiptap/extension-highlight"

export const RNestHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-color"),
        renderHTML: (attributes) => ({
          "data-color": attributes.color,
          style: `background-color: var(--highlight-${attributes.color})`,
          class: `rnest-highlight rnest-highlight-${attributes.color}`,
        }),
      },
    }
  },
})
```

CSS 변수로 색상 정의:

```css
/* src/components/tiptap/editor.css */
:root {
  --highlight-yellow: #FFF3B0;
  --highlight-green:  #C8F7C5;
  --highlight-blue:   #BDE8FF;
  --highlight-pink:   #FFD6E7;
  --highlight-orange: #FFE4B5;
  --highlight-purple: #E8D5FF;
}
```

### 9.2 Link Mark 처리

- `Link` extension: `openOnClick: false` (모바일 UX 배려)
- 링크 삽입 UI: 플로팅 툴바에 링크 버튼 → 팝오버에서 URL 입력
- 기존 `bookmark` 블록과 구분: Link mark는 인라인, bookmark는 블록 레벨

---

## 10. 슬래시 커맨드 (`/` 메뉴)

### 10.1 동작 방식

1. 빈 줄에서 `/` 입력 시 커맨드 팔레트 표시
2. 텍스트 입력으로 필터링
3. Enter 또는 클릭으로 블록 타입 변환

### 10.2 커맨드 목록

```typescript
const SLASH_COMMANDS = [
  // 기본 텍스트
  { id: "paragraph",   icon: "AlignLeft",    label: "문단",        keywords: ["p", "text", "paragraph"] },
  { id: "heading",     icon: "Heading2",     label: "제목",        keywords: ["h2", "heading", "제목"] },

  // 목록
  { id: "bulleted",    icon: "List",         label: "글머리 목록",  keywords: ["ul", "bullet", "list"] },
  { id: "numbered",    icon: "ListOrdered",  label: "번호 목록",   keywords: ["ol", "numbered", "번호"] },
  { id: "checklist",   icon: "CheckSquare",  label: "체크리스트",  keywords: ["check", "todo", "체크"] },

  // 강조
  { id: "callout",     icon: "MessageSquare",label: "콜아웃",      keywords: ["callout", "info", "note"] },
  { id: "quote",       icon: "Quote",        label: "인용구",      keywords: ["quote", "인용"] },
  { id: "toggle",      icon: "ChevronRight", label: "토글",        keywords: ["toggle", "collapse", "토글"] },

  // 구조
  { id: "table",       icon: "Table",        label: "표",          keywords: ["table", "grid", "표"] },
  { id: "divider",     icon: "Minus",        label: "구분선",      keywords: ["hr", "divider", "구분"] },

  // 미디어
  { id: "image",       icon: "Image",        label: "이미지",      keywords: ["image", "photo", "이미지"] },
  { id: "attachment",  icon: "Paperclip",    label: "파일 첨부",   keywords: ["file", "attach", "파일"] },
  { id: "bookmark",    icon: "Bookmark",     label: "북마크",      keywords: ["link", "url", "bookmark", "북마크"] },
]
```

### 10.3 구현 방식

`@tiptap/suggestion` 라이브러리를 사용하여 구현:

```typescript
// src/lib/tiptap/extensions/SlashCommand.ts
import { Extension } from "@tiptap/core"
import Suggestion from "@tiptap/suggestion"

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
      },
    }
  },
  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })]
  },
})
```

---

## 11. 데이터 직렬화 · 역직렬화

### 11.1 `blockArrayToTiptap` (로드 시)

```typescript
// src/lib/tiptap/serializer/blockArrayToTiptap.ts

export function blockArrayToTiptap(blocks: RNestMemoBlock[]): TiptapDoc {
  return {
    type: "doc",
    content: blocks.map(blockToTiptapNode).filter(Boolean),
  }
}

function blockToTiptapNode(block: RNestMemoBlock): TiptapNode | null {
  // richText 필드 우선, 없으면 text 필드를 plain text로 변환
  const inlineContent = block.richText
    ? block.richText
    : block.text
    ? [{ type: "text", text: block.text }]
    : []

  switch (block.type) {
    case "paragraph":
      return { type: "paragraph", content: inlineContent }

    case "heading":
      return { type: "heading", attrs: { level: 2 }, content: inlineContent }

    case "bulleted":
      return {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph", content: inlineContent }] }],
      }

    case "numbered":
      return {
        type: "orderedList",
        content: [{ type: "listItem", content: [{ type: "paragraph", content: inlineContent }] }],
      }

    case "checklist":
      return {
        type: "taskList",
        content: [{
          type: "taskItem",
          attrs: { checked: block.checked ?? false },
          content: [{ type: "paragraph", content: inlineContent }],
        }],
      }

    case "callout":
      return { type: "callout", content: [{ type: "paragraph", content: inlineContent }] }

    case "quote":
      return { type: "blockquote", content: [{ type: "paragraph", content: inlineContent }] }

    case "toggle":
      return {
        type: "toggle",
        content: [
          { type: "toggleSummary", content: inlineContent },
          { type: "toggleContent", content: block.richDetailText
            ? [{ type: "paragraph", content: block.richDetailText }]
            : block.detailText
            ? [{ type: "paragraph", content: [{ type: "text", text: block.detailText }] }]
            : [{ type: "paragraph" }]
          },
        ],
        attrs: { collapsed: block.collapsed ?? false },
      }

    case "divider":
      return { type: "horizontalRule" }

    case "table":
      return {
        type: "rnestTable",
        attrs: {
          columns: block.table?.columns ?? ["항목", "내용"],
          blockId: block.id,
        },
        content: (block.table?.rows ?? []).map((row) => ({
          type: "rnestTableRow",
          attrs: { rowId: row.id, left: row.left, right: row.right },
        })),
      }

    case "bookmark":
      return {
        type: "bookmark",
        attrs: {
          url: block.text ?? "",
          description: block.detailText ?? "",
          blockId: block.id,
        },
      }

    case "image":
      return {
        type: "rnestImage",
        attrs: {
          attachmentId: block.attachmentId,
          caption: block.text ?? "",
          mediaWidth: block.mediaWidth ?? 100,
          mediaAspectRatio: block.mediaAspectRatio,
          blockId: block.id,
        },
      }

    case "attachment":
      return {
        type: "rnestAttachment",
        attrs: {
          attachmentId: block.attachmentId,
          description: block.text ?? "",
          blockId: block.id,
        },
      }

    default:
      return null
  }
}
```

### 11.2 `tiptapToBlockArray` (저장 시)

```typescript
// src/lib/tiptap/serializer/tiptapToBlockArray.ts

export function tiptapToBlockArray(doc: TiptapDoc): RNestMemoBlock[] {
  const blocks: RNestMemoBlock[] = []

  for (const node of doc.content ?? []) {
    const block = tiptapNodeToBlock(node)
    if (block) blocks.push(block)
  }

  return blocks.slice(0, MAX_BLOCKS)
}

function extractInlineContent(node: TiptapNode): TiptapInlineContent[] {
  return (node.content ?? [])
    .filter((n) => n.type === "text" || n.type === "hardBreak")
    .map((n) => ({
      type: n.type as "text" | "hardBreak",
      text: n.text,
      marks: n.marks,
    }))
}

function inlineContentToPlainText(content: TiptapInlineContent[]): string {
  return content.map((n) => n.text ?? "").join("")
}

function tiptapNodeToBlock(node: TiptapNode): RNestMemoBlock | null {
  switch (node.type) {
    case "paragraph": {
      const richText = extractInlineContent(node)
      return createMemoBlock("paragraph", {
        richText,
        text: inlineContentToPlainText(richText),
      })
    }
    case "heading": {
      const richText = extractInlineContent(node)
      return createMemoBlock("heading", {
        richText,
        text: inlineContentToPlainText(richText),
      })
    }
    case "bulletList": {
      // bulletList 하위 listItem들을 각각의 bulleted 블록으로 변환
      return (node.content ?? []).map((li) => {
        const para = li.content?.[0]
        const richText = para ? extractInlineContent(para) : []
        return createMemoBlock("bulleted", { richText, text: inlineContentToPlainText(richText) })
      })[0] ?? null  // 첫 번째만 (다중 항목은 별도 처리)
    }
    // ... 나머지 타입들 동일 패턴
    case "horizontalRule":
      return createMemoBlock("divider")
    case "rnestTable": {
      const rows = (node.content ?? []).map((rowNode) => ({
        id: rowNode.attrs?.rowId ?? createNotebookId("memo_row"),
        left: rowNode.attrs?.left ?? "",
        right: rowNode.attrs?.right ?? "",
      }))
      return createMemoBlock("table", {
        id: node.attrs?.blockId,
        table: { columns: node.attrs?.columns ?? ["항목", "내용"], rows },
      })
    }
    case "bookmark":
      return createMemoBlock("bookmark", {
        id: node.attrs?.blockId,
        text: node.attrs?.url ?? "",
        detailText: node.attrs?.description ?? "",
      })
    // ... image, attachment 동일 패턴
    default:
      return null
  }
}
```

> **중요**: `bulletList`, `orderedList`, `taskList`는 Tiptap에서 하나의 리스트 노드 안에 여러 항목을 갖는다. 기존 블록 모델은 항목마다 별도 블록이므로, 직렬화 시 리스트를 펼쳐 각 항목을 독립 블록으로 저장한다.

---

## 12. 기존 데이터 마이그레이션

### 12.1 마이그레이션 전략: 무중단 점진적 전환

**별도 DB 마이그레이션 없음.** 기존 `RNestMemoBlock[]` 구조를 그대로 유지하면서, 에디터만 Tiptap으로 교체한다.

```
기존 사용자 데이터:
  blocks: [{ type: "paragraph", text: "안녕하세요" }]

새 에디터 로드 시:
  blockArrayToTiptap → { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "안녕하세요" }] }] }

새 에디터 저장 시 (서식 없는 경우):
  tiptapToBlockArray → [{ type: "paragraph", text: "안녕하세요", richText: [{ type: "text", text: "안녕하세요" }] }]

새 에디터 저장 시 (서식 있는 경우):
  tiptapToBlockArray → [{ type: "paragraph", text: "안녕하세요", richText: [{ type: "text", text: "안녕하세요", marks: [{ type: "bold" }] }] }]
```

### 12.2 하위 호환성 보장

- `richText` 필드는 `notebook.ts`의 `sanitizeMemoBlock`에서 optional로 처리
- `richText` 없는 기존 데이터: `text` 필드로 plain text 에디터 동작 (자동 변환)
- 롤백 시: `richText` 필드는 무시되고 `text` 필드로 정상 동작

### 12.3 `notebook.ts` sanitize 함수 업데이트

```typescript
// MAX_RICH_TEXT_NODES 제한 추가
const MAX_RICH_TEXT_NODES = 200

function sanitizeInlineContent(value: unknown): TiptapInlineContent[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  return value
    .slice(0, MAX_RICH_TEXT_NODES)
    .filter((node) => node && typeof node === "object")
    .map((node) => ({
      type: node.type === "hardBreak" ? "hardBreak" : "text",
      text: typeof node.text === "string" ? node.text.slice(0, 1000) : undefined,
      marks: Array.isArray(node.marks) ? node.marks.slice(0, 10) : undefined,
    }))
}
```

---

## 13. 암호화(잠금 메모) 호환성

### 13.1 기존 암호화 로직과의 연동

잠금 메모(`RNestMemoLockEnvelope`)는 현재 `blocks`, `attachments`, `tags` 전체를 JSON으로 직렬화 후 AES-GCM 암호화한다.

```typescript
// notebookSecurity.ts 의 암호화 대상 (기존 유지)
type RNestLockedMemoPayload = {
  title: string
  blocks: RNestMemoBlock[]   // richText 필드가 포함된 블록도 동일하게 암호화됨
  attachments: RNestMemoAttachment[]
  tags: string[]
}
```

**변경 불필요**: `richText` 필드는 `RNestMemoBlock`의 일부이므로 기존 암호화 로직이 그대로 적용된다.

### 13.2 잠금 메모의 readOnly 에디터

```typescript
// 잠금된 메모: RNestEditor에 readOnly={true} 전달
// Tiptap editor.setEditable(false) 호출
// → EditorToolbar, FloatingToolbar, SlashCommand 비활성화
```

---

## 14. 첨부파일 · 이미지 블록 처리

### 14.1 이미지 NodeView

```typescript
// src/components/tiptap/nodes/ImageNodeView.tsx
// NodeViewWrapper + NodeViewContent 활용

// 기존 기능 유지:
// - 이미지 미리보기 (Supabase signed URL)
// - 드래그로 너비 조절 (mediaWidth: 20~100%)
// - 캡션 텍스트 편집 (plain input, 서식 없음)
// - 삭제 버튼
```

### 14.2 첨부파일 업로드 흐름

Tiptap 에디터는 파일 업로드 로직을 직접 담당하지 않는다. 기존 `ToolNotebookPage`의 업로드 흐름을 유지하되, 업로드 완료 후 에디터에 블록을 삽입하는 커맨드를 추가한다:

```typescript
// 이미지 업로드 완료 후 에디터에 이미지 블록 삽입
editor.commands.insertContent({
  type: "rnestImage",
  attrs: {
    attachmentId: newAttachment.id,
    caption: "",
    mediaWidth: 100,
    blockId: createNotebookId("memo_block"),
  },
})
```

---

## 15. 자동 저장 · Supabase 동기화

### 15.1 저장 흐름 (기존 구조 유지)

```typescript
// useTiptapEditor.ts 내부
const debouncedSave = useDebouncedCallback((json: JSONContent) => {
  const blocks = tiptapToBlockArray(json)
  onBlocksChange(blocks)   // → Zustand store 업데이트 → localStorage
}, 500)  // 기존 500ms debounce 유지
```

### 15.2 CloudNotebookSync 연동

- 기존 `CloudNotebookSync.tsx`는 Zustand store의 `memo` 상태를 감시하여 Supabase에 동기화
- Tiptap 변경 → `tiptapToBlockArray` → Zustand store 업데이트 → `CloudNotebookSync`가 자동 감지
- **별도 수정 불필요**

### 15.3 저장 중 UX

- Tiptap `onUpdate` 콜백이 실행될 때 저장 중 인디케이터 표시 (기존 동일)
- `onUpdate` 실행 중 debounce 타이머가 초기화됨 → 타이핑 중 저장 방지

---

## 16. 모바일 · PWA 대응

### 16.1 한국어 IME 처리

Tiptap(ProseMirror)은 IME 이벤트를 네이티브로 처리한다:

- `compositionstart`: 에디터 업데이트 일시 중단
- `compositionend`: 업데이트 재개 + 저장 트리거

**기존 수동 IME 처리 코드 삭제 가능.**

### 16.2 모바일 툴바

- 기본 툴바는 모바일에서 숨김 (화면 공간 제한)
- 대신 FloatingToolbar를 텍스트 선택 시에만 표시
- 블록 타입 변환: 블록 좌측 드래그 핸들 롱프레스 → 컨텍스트 메뉴

### 16.3 소프트 키보드 대응

```typescript
// 에디터 포커스 시 스크롤 이동 (기존 동일)
editor.on("focus", () => {
  requestAnimationFrame(() => {
    editor.view.dom.scrollIntoView({ block: "nearest", behavior: "smooth" })
  })
})
```

### 16.4 iOS Safari 특이사항

- `contenteditable` + `overflow: auto` 중첩 스크롤 버그 회피
- `-webkit-overflow-scrolling: touch` 설정
- `position: sticky` 툴바는 iOS에서 `position: fixed`로 폴백

---

## 17. 성능 최적화

### 17.1 동적 임포트 (Code Splitting)

에디터 관련 코드를 lazy load하여 초기 번들 크기 최소화:

```typescript
// src/components/pages/tools/ToolNotebookPage.tsx
const RNestEditor = dynamic(
  () => import("@/components/tiptap/RNestEditor"),
  {
    loading: () => <EditorSkeleton />,
    ssr: false,  // contenteditable은 SSR 불가
  }
)
```

### 17.2 에디터 메모이제이션

```typescript
// 불필요한 에디터 재마운트 방지
// doc.id가 바뀔 때만 content 교체 (key prop 변경이 아닌 setContent 사용)
const memoizedExtensions = useMemo(() => getRNestExtensions(), [])
```

### 17.3 대용량 문서 처리

- 최대 64블록 제한 유지 (ProseMirror의 렌더링 부하 방지)
- 각 블록 최대 4,000자 제한 유지
- 이미지 NodeView: 화면 밖 이미지는 Intersection Observer로 lazy load

### 17.4 번들 크기 예상

| 항목 | 크기(gzip) |
|------|-----------|
| @tiptap/react + @tiptap/pm | ~45KB |
| @tiptap/core + extensions (기본) | ~30KB |
| 커스텀 확장 + 직렬화 코드 | ~10KB |
| **합계** | **~85KB** |

> 목표인 150KB 이하 달성 예상

---

## 18. 보안 고려사항

### 18.1 XSS 방지

Tiptap은 기본적으로 `innerHTML` 직접 설정을 피하고 ProseMirror DOM을 사용한다. 그러나 다음 사항을 주의한다:

- `Link` extension: `rel="noopener noreferrer"` 자동 추가
- 커스텀 NodeView에서 사용자 입력을 `dangerouslySetInnerHTML`로 렌더링하지 않을 것
- `bookmark` 블록의 URL: `https://`, `http://`, `mailto:` 프로토콜만 허용

```typescript
// BookmarkNode.ts
function sanitizeBookmarkUrl(url: string): string {
  const trimmed = url.trim()
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`
  return ""
}
```

### 18.2 paste 이벤트 필터링

외부에서 붙여넣기 시 스크립트 포함 HTML 차단:

```typescript
// Tiptap transformPastedHTML 옵션 사용
editorProps: {
  transformPastedHTML(html) {
    // DOMParser로 파싱 후 허용된 태그만 유지
    return sanitizeHtml(html, {
      allowedTags: ["p", "strong", "em", "u", "s", "code", "ul", "ol", "li", "blockquote", "br"],
      allowedAttributes: {},
    })
  },
}
```

---

## 19. CSP 업데이트

### 19.1 현재 CSP와의 충돌 없음

Tiptap은 `eval()` 또는 `blob:` URL을 사용하지 않으므로 현재 `next.config.mjs`의 CSP 설정과 충돌하지 않는다.

### 19.2 추가 필요 항목 없음

- `script-src`: Tiptap은 동적 스크립트 삽입 없음
- `style-src`: 에디터 CSS는 정적 번들로 포함
- `img-src`: 기존 Supabase Storage 도메인 허용 유지

---

## 20. 단계별 구현 로드맵

### Phase 0: 준비 (1일)

- [ ] `claude/tiptap-notes-planning-3cTaK` 브랜치에 기획서 커밋
- [ ] Tiptap 패키지 설치 및 package.json 업데이트
- [ ] TypeScript 타입 정의 (`TiptapInlineContent` 등) `notebook.ts`에 추가
- [ ] `src/lib/tiptap/` 디렉토리 구조 생성

### Phase 1: 직렬화 레이어 (2일)

- [ ] `blockArrayToTiptap.ts` 구현 및 단위 테스트
- [ ] `tiptapToBlockArray.ts` 구현 및 단위 테스트
- [ ] 13개 블록 타입 전체 변환 검증
- [ ] 하위 호환성 테스트 (기존 데이터 형식 → 정상 변환 확인)

### Phase 2: 기본 에디터 (3일)

- [ ] 기본 확장 등록 (`getRNestExtensions`)
- [ ] `useTiptapEditor` 훅 구현
- [ ] `RNestEditor` 컴포넌트 기본 구조
- [ ] `paragraph`, `heading`, `bulleted`, `numbered`, `checklist`, `quote`, `divider` 노드 동작 확인
- [ ] `EditorToolbar` 기본 서식 버튼 구현

### Phase 3: 커스텀 노드 (4일)

- [ ] `CalloutNode` + `CalloutNodeView`
- [ ] `ToggleNode` + `ToggleNodeView` (접기/펼치기 애니메이션 포함)
- [ ] `RNestTableNode` + `RNestTableNodeView` (2-column, 행 추가/삭제)
- [ ] `BookmarkNode` + `BookmarkNodeView` (URL 미리보기)
- [ ] `RNestImageNode` + `ImageNodeView` (너비 조절 포함)
- [ ] `RNestAttachmentNode` + `AttachmentNodeView`

### Phase 4: 고급 기능 (2일)

- [ ] `SlashCommand` 확장 + `SlashCommandMenu` UI
- [ ] `FloatingToolbar` (선택 영역 플로팅 툴바)
- [ ] `RNestHighlight` 커스텀 Mark (6색)
- [ ] 링크 삽입 UI

### Phase 5: ToolNotebookPage 통합 (3일)

- [ ] 기존 블록 렌더링 코드를 `<RNestEditor>`로 교체
- [ ] 첨부파일 업로드 연동
- [ ] 잠금 메모 readOnly 모드 연동
- [ ] 자동 저장 및 CloudNotebookSync 연동 확인

### Phase 6: QA 및 마무리 (2일)

- [ ] 기존 모든 블록 타입 E2E 테스트
- [ ] 모바일(iOS/Android) 한국어 IME 테스트
- [ ] 기존 사용자 데이터 마이그레이션 호환성 검증
- [ ] 번들 크기 측정 (< 150KB gzip 목표)
- [ ] 성능 프로파일링 (에디터 초기화 < 200ms)
- [ ] 잠금 메모 암호화/복호화 동작 검증

**총 예상 작업 기간: 약 17일**

---

## 21. 리스크 분석 및 대응

| 리스크 | 가능성 | 영향도 | 대응 방안 |
|--------|--------|--------|---------|
| 기존 사용자 데이터 손실 | 낮음 | 매우 높음 | `text` 필드 하위 호환 유지, 롤백 플래그 준비 |
| 한국어 IME 버그 | 중간 | 높음 | Tiptap GitHub 이슈 사전 확인, 직접 테스트 |
| 모바일 성능 저하 | 중간 | 중간 | 동적 임포트, 64블록 제한 유지 |
| 번들 크기 초과 | 낮음 | 중간 | 개별 패키지 설치로 tree-shaking 최대화 |
| ProseMirror 복잡도 | 중간 | 중간 | Tiptap 추상화 레이어 최대 활용 |
| CSP 충돌 | 낮음 | 높음 | 배포 전 CSP 헤더 검증 필수 |
| toggle 블록 복잡성 | 중간 | 낮음 | ProseMirror details/summary 패턴 참조 |
| 암호화 메모 호환성 | 낮음 | 매우 높음 | `RNestMemoBlock` 구조 무변경 원칙 준수 |

### 21.1 롤백 계획

`ToolNotebookPage.tsx`에 Feature Flag를 추가하여 언제든 기존 에디터로 롤백 가능하도록 한다:

```typescript
// 환경 변수로 에디터 선택
const USE_TIPTAP_EDITOR = process.env.NEXT_PUBLIC_USE_TIPTAP === "true"

// 조건부 렌더링
{USE_TIPTAP_EDITOR ? (
  <RNestEditor doc={currentDoc} onBlocksChange={handleBlocksChange} />
) : (
  <LegacyBlockEditor doc={currentDoc} onBlocksChange={handleBlocksChange} />
)}
```

---

## 22. 테스트 전략

### 22.1 단위 테스트 (Jest)

```
src/lib/tiptap/serializer/__tests__/
├── blockArrayToTiptap.test.ts    # 13종 블록 → Tiptap JSON 변환
├── tiptapToBlockArray.test.ts    # Tiptap JSON → 13종 블록 변환
└── roundtrip.test.ts             # 왕복 변환 후 데이터 동일성 검증
```

**핵심 테스트 케이스**:

```typescript
describe("roundtrip serialization", () => {
  it("paragraph with bold text", () => {
    const input: RNestMemoBlock[] = [
      { id: "b1", type: "paragraph", text: "Hello", richText: [
        { type: "text", text: "Hello", marks: [{ type: "bold" }] }
      ]}
    ]
    const tiptap = blockArrayToTiptap(input)
    const output = tiptapToBlockArray(tiptap)
    expect(output[0].type).toBe("paragraph")
    expect(output[0].richText?.[0].marks?.[0].type).toBe("bold")
  })

  it("legacy plain text block migrates correctly", () => {
    const input: RNestMemoBlock[] = [
      { id: "b1", type: "paragraph", text: "레거시 텍스트" }  // richText 없음
    ]
    const tiptap = blockArrayToTiptap(input)
    const output = tiptapToBlockArray(tiptap)
    expect(output[0].text).toBe("레거시 텍스트")
  })

  it("all 13 block types survive roundtrip", () => {
    // 13개 블록 타입 모두 테스트
  })
})
```

### 22.2 통합 테스트 (Playwright)

```
tests/notebook/
├── tiptap-basic.spec.ts          # 기본 타이핑, 서식 적용
├── tiptap-blocks.spec.ts         # 슬래시 커맨드, 블록 타입 전환
├── tiptap-mobile.spec.ts         # 모바일 뷰포트 테스트
├── tiptap-lock.spec.ts           # 잠금 메모 암호화/복호화
└── tiptap-attachment.spec.ts     # 이미지/파일 첨부
```

### 22.3 수동 테스트 체크리스트

- [ ] 한국어 입력 (Samsung Keyboard, Apple 기본 키보드)
- [ ] 영어/한국어 혼용 입력 중 IME 전환
- [ ] 긴 문서 (64블록) 편집 성능
- [ ] 오프라인 상태에서 편집 후 재연결 시 동기화
- [ ] 잠금 설정 → 해제 → 편집 → 재잠금 플로우
- [ ] 첨부 이미지 너비 드래그 조절
- [ ] 이전 버전 데이터(`richText` 없는 레거시) 정상 로드

---

## 23. 결론

### 23.1 요약

| 항목 | 기존 | 변경 후 |
|------|------|--------|
| 에디터 엔진 | Native input/textarea | Tiptap v2 (ProseMirror) |
| 인라인 서식 | 없음 | Bold/Italic/Underline/Strike/Code/Highlight/Link |
| 블록 타입 전환 | 수동 UI | `/` 슬래시 커맨드 |
| 붙여넣기 | Plain text | 서식 있는 HTML 변환 (sanitize) |
| 한국어 IME | 수동 핸들링 | ProseMirror 네이티브 처리 |
| 데이터 호환성 | - | 100% 하위 호환 유지 |
| 번들 증가 | 0 | ~85KB gzip |

### 23.2 핵심 원칙

1. **데이터 구조 불변**: `RNestMemoBlock[]`은 저장 형식으로 그대로 유지한다
2. **하위 호환 우선**: 기존 데이터는 `text` 필드로 완전히 복원 가능하다
3. **점진적 전환**: Phase별 구현으로 각 단계에서 롤백 가능하도록 한다
4. **모바일 퍼스트**: PWA 환경, 한국어 IME, 터치 인터페이스를 최우선 고려한다
5. **보안 불변**: 암호화 메모의 동작 방식은 변경하지 않는다

---

*이 기획서는 `claude/tiptap-notes-planning-3cTaK` 브랜치에서 관리됩니다.*
