import { cn } from "@/lib/cn";

type SocialAvatarGlyphProps = {
  emoji?: string | null;
  className?: string;
};

type SocialAvatarBadgeProps = {
  emoji?: string | null;
  className?: string;
  iconClassName?: string;
  title?: string;
};

export const DEFAULT_SOCIAL_AVATAR = "🐧";
export const SOCIAL_AVATAR_OPTIONS = ["🐧", "🦊", "🐱", "🐻", "🦁", "🐺", "🦅", "🐬"] as const;

type SocialAvatarValue = (typeof SOCIAL_AVATAR_OPTIONS)[number] | "📝" | "👤";

function normalizeSocialAvatar(emoji?: string | null): SocialAvatarValue {
  const value = String(emoji ?? "").trim();
  if (value === "📝") return "📝";
  if (value === "👤") return "👤";
  if ((SOCIAL_AVATAR_OPTIONS as readonly string[]).includes(value)) {
    return value as SocialAvatarValue;
  }
  return DEFAULT_SOCIAL_AVATAR;
}

function NoteGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M18 12h20l8 8v32H18a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z" fill="#F8FAFC" />
      <path d="M38 12v9a3 3 0 0 0 3 3h9" fill="#E2E8F0" />
      <path d="M25 28h14" stroke="#6366F1" strokeWidth="4" strokeLinecap="round" />
      <path d="M25 36h14" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
      <path d="M25 44h9" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
      <path d="M38 12v9a3 3 0 0 0 3 3h9" stroke="#CBD5E1" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M18 12h20l8 8v32H18a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z" stroke="#CBD5E1" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

function UserGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="24" r="10" fill="#818CF8" />
      <path
        d="M18 50c2.5-8.4 8-12.6 14-12.6S43.5 41.6 46 50"
        fill="none"
        stroke="#312E81"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="24" r="10" fill="none" stroke="#312E81" strokeWidth="4" />
    </svg>
  );
}

function PenguinGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="34" rx="17" ry="21" fill="#0F172A" />
      <ellipse cx="32" cy="38" rx="11" ry="15" fill="#F8FAFC" />
      <circle cx="25.5" cy="28.5" r="4" fill="#F8FAFC" />
      <circle cx="38.5" cy="28.5" r="4" fill="#F8FAFC" />
      <circle cx="26.5" cy="29" r="1.6" fill="#0F172A" />
      <circle cx="37.5" cy="29" r="1.6" fill="#0F172A" />
      <path d="M32 31.5 26.8 35h10.4L32 31.5Z" fill="#F59E0B" />
      <path d="M25 13.5c-2.5 2-4.2 5.1-4.2 9.2" fill="none" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" />
      <path d="M39 13.5c2.5 2 4.2 5.1 4.2 9.2" fill="none" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function FoxGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M19 23 26 11l6 7 6-7 7 12v17l-13 13-13-13V23Z" fill="#F97316" />
      <path d="M22 38c2.8 6.8 6.2 10.2 10 10.2S39.2 44.8 42 38c-3.2-2.8-6.5-4.2-10-4.2S25.2 35.2 22 38Z" fill="#FFF7ED" />
      <circle cx="26.5" cy="29" r="2" fill="#111827" />
      <circle cx="37.5" cy="29" r="2" fill="#111827" />
      <path d="M32 30.5 29.6 34h4.8L32 30.5Z" fill="#111827" />
      <path d="M27.5 37.5c1.5 2 3 2.9 4.5 2.9s3-.9 4.5-2.9" fill="none" stroke="#F97316" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

function CatGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M18 23 24 13l8 6 8-6 6 10v15a14 14 0 0 1-14 14 14 14 0 0 1-14-14V23Z" fill="#A5B4FC" />
      <path d="M24 40c2 3.6 4.7 5.4 8 5.4s6-1.8 8-5.4c-2.3-2.4-5-3.6-8-3.6s-5.7 1.2-8 3.6Z" fill="#EEF2FF" />
      <circle cx="26.5" cy="29.5" r="1.9" fill="#111827" />
      <circle cx="37.5" cy="29.5" r="1.9" fill="#111827" />
      <path d="M32 31.5 29.8 34h4.4L32 31.5Z" fill="#111827" />
      <path d="M22 33h5" stroke="#64748B" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M37 33h5" stroke="#64748B" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M21.5 37.5h5.5" stroke="#64748B" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M37 37.5h5.5" stroke="#64748B" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function BearGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="22" cy="19" r="7" fill="#8B5E3C" />
      <circle cx="42" cy="19" r="7" fill="#8B5E3C" />
      <circle cx="32" cy="31" r="18" fill="#A16207" />
      <ellipse cx="32" cy="38" rx="10" ry="8" fill="#F5E7D7" />
      <circle cx="25.5" cy="29" r="2" fill="#111827" />
      <circle cx="38.5" cy="29" r="2" fill="#111827" />
      <path d="M32 33.2 29.4 36h5.2L32 33.2Z" fill="#111827" />
      <path d="M28.8 39.8c1.2 1.4 2.3 2 3.2 2s2-.6 3.2-2" fill="none" stroke="#7C4A2D" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function LionGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="30" r="22" fill="#F59E0B" />
      <circle cx="32" cy="32" r="14" fill="#FDE68A" />
      <circle cx="26.5" cy="29.5" r="2" fill="#111827" />
      <circle cx="37.5" cy="29.5" r="2" fill="#111827" />
      <path d="M32 31.5 29.7 34.3h4.6L32 31.5Z" fill="#B45309" />
      <path d="M27.8 38.2c1.4 1.8 2.8 2.6 4.2 2.6s2.8-.8 4.2-2.6" fill="none" stroke="#B45309" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M18 22c-3 4-4.3 7.7-4.3 12" fill="none" stroke="#D97706" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M46 22c3 4 4.3 7.7 4.3 12" fill="none" stroke="#D97706" strokeWidth="4.2" strokeLinecap="round" />
    </svg>
  );
}

function WolfGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M18 25 24 12l8 8 8-8 6 13v14l-14 13-14-13V25Z" fill="#94A3B8" />
      <path d="M24 38c2.2 5 4.9 7.6 8 7.6s5.8-2.6 8-7.6c-2.6-2.2-5.3-3.3-8-3.3s-5.4 1.1-8 3.3Z" fill="#F8FAFC" />
      <circle cx="26.5" cy="29" r="2" fill="#111827" />
      <circle cx="37.5" cy="29" r="2" fill="#111827" />
      <path d="M32 31 29.5 34.4h5L32 31Z" fill="#111827" />
      <path d="M29 39.2c1 1.1 2 1.7 3 1.7s2-.6 3-1.7" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function EagleGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M17 37c0-11 7.5-20 18-20 4.9 0 9.4 1.9 12.8 5.2l-10.8 9.2H27l-10 5.6Z" fill="#94A3B8" />
      <path d="M47.8 22.2C44.6 19.4 40.7 18 36 18c-5.6 0-10.4 2-14 5.8 2.5 6 7.4 8.8 14.7 8.8h.2l10.9-10.4Z" fill="#F8FAFC" />
      <path d="M36.7 31.8 51 29l-6.7 9.8-11.8.4 4.2-7.4Z" fill="#F59E0B" />
      <circle cx="33.8" cy="26.5" r="1.7" fill="#111827" />
      <path d="M18 37c3 8.8 8.6 13.2 16.8 13.2 7.7 0 13.7-4 17.9-12" fill="none" stroke="#64748B" strokeWidth="4.2" strokeLinecap="round" />
    </svg>
  );
}

function DolphinGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M18 37.5c4.8-10.5 12.7-16.7 23.9-18.8 1.7-.3 3.7-.4 4.8.7 1.2 1.2 1 3.1.3 4.8l-1.7 4.2c2.6 1.2 4.8 3.6 5.8 6.6 1 3 .6 6.4-1.2 9l-4.5-3.8-6.8 8.8-3.7-5.5c-4.7.7-8.5 0-11.5-2.1l-6.4 1.7Z"
        fill="#38BDF8"
      />
      <path
        d="M24 40.2c2.2-4.9 5.7-8.4 10.3-10.2 2-.8 4.3-1.3 6.3-.6 2.4.9 4 3.4 4.2 6.2.2 2.9-1.1 5.8-3.6 7.4-2.4 1.6-5.4 2-8.1 1.1-3.2-1-5.8-3.5-9.1-3.9Z"
        fill="#E0F2FE"
      />
      <circle cx="39" cy="29.5" r="1.5" fill="#0F172A" />
      <path d="M44.5 26.6 49.6 22" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function SocialAvatarGlyph({ emoji, className = "" }: SocialAvatarGlyphProps) {
  const avatar = normalizeSocialAvatar(emoji);

  if (avatar === "📝") return <NoteGlyph className={className} />;
  if (avatar === "👤") return <UserGlyph className={className} />;
  if (avatar === "🦊") return <FoxGlyph className={className} />;
  if (avatar === "🐱") return <CatGlyph className={className} />;
  if (avatar === "🐻") return <BearGlyph className={className} />;
  if (avatar === "🦁") return <LionGlyph className={className} />;
  if (avatar === "🐺") return <WolfGlyph className={className} />;
  if (avatar === "🦅") return <EagleGlyph className={className} />;
  if (avatar === "🐬") return <DolphinGlyph className={className} />;
  return <PenguinGlyph className={className} />;
}

export function SocialAvatarBadge({
  emoji,
  className = "",
  iconClassName = "",
  title,
}: SocialAvatarBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,rgba(246,244,255,0.98),rgba(255,255,255,0.98))]",
        className
      )}
      title={title}
    >
      <SocialAvatarGlyph emoji={emoji} className={cn("h-[72%] w-[72%]", iconClassName)} />
    </span>
  );
}
