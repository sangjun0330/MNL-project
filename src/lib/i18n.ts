export type Language = "ko" | "en";

type Vars = Record<string, string | number>;

const EN: Record<string, string> = {
  // Settings / common
  "설정": "Settings",
  "모든 기능을 사용하려면 로그인해야 합니다.": "Log in to use everything.",
  "일반": "General",
  "계정": "Account",
  "모드 설정": "Mode",
  "라이트 모드": "Light mode",
  "다크 모드": "Dark mode",
  "언어": "Language",
  "한국어": "Korean",
  "영어": "English",
  "영어 (미국)": "English (US)",
  "소셜 로그인": "Social sign-in",
  "로그인 방식": "Sign-in method",
  "계정 이메일": "Email",
  "로그인된 계정에 기록이 안전하게 저장됩니다.": "Your records are saved securely to this account.",
  "로그아웃": "Log out",
  "계정삭제": "Delete Account",
  "계정 삭제하기": "Delete Account",
  "정말로 계정을 삭제할까요?": "Are you sure you want to delete your account?",
  "삭제를 진행하려면 아래에 DELETE를 입력하세요.": "To continue, type DELETE below.",
  "삭제": "Delete",
  "취소": "Cancel",
  "Google로 계속": "Continue with Google",
  "Google 계정으로 로그인하면 기록이 계정에 저장되어 앱을 지우거나 기기를 바꿔도 복원할 수 있습니다.":
    "Sign in with Google to keep your records in your account, even if you switch devices.",
  "로그인 상태를 확인 중이에요.": "Checking your sign-in status...",
  "로그인 후 모든 기능(일정, 기록, 인사이트)을 사용할 수 있어요.":
    "Once you sign in, you can use all features (schedule, logs, insights).",
  "계정 삭제는 모든 데이터를 영구적으로 삭제합니다.": "Deleting your account permanently removes all your data.",
  "삭제하려면 DELETE를 입력해 주세요.": "Please type DELETE to proceed.",
  "삭제 중...": "Deleting...",
  "삭제가 완료되었습니다.": "Account deleted.",
  "삭제에 실패했습니다. 다시 시도해 주세요.": "Couldn't delete your account. Please try again.",
  "로그인이 필요해요": "Please log in first.",
  "로그인이 필요합니다": "Please log in first.",
  "설정으로 이동": "Open Settings",
  "모든 기능은 로그인 후 사용할 수 있어요. 설정에서 소셜 로그인으로 연결해 주세요.":
    "Please sign in from Settings to use all features.",
  "모든 기능을 사용하려면 로그인해야 합니다. 설정으로 이동해 주세요.":
    "Log in to use everything. Open Settings to continue.",
  "데이터 동기화 중…": "Syncing your data...",
  "로그인 데이터를 불러오는 중입니다.": "Loading your account data.",
  "알 수 없음": "Unknown",
  // Bottom nav
  "홈": "Home",
  "일정": "Schedule",
  "인사이트": "Insights",
};

let currentLang: Language = "ko";

export function setCurrentLanguage(lang: Language) {
  currentLang = lang;
}

export function getCurrentLanguage(): Language {
  return currentLang;
}

function applyVars(text: string, vars?: Vars) {
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    text
  );
}

export function translate(key: string, vars?: Vars, lang: Language = currentLang) {
  const table = lang === "en" ? EN : null;
  const base = table?.[key] ?? key;
  return applyVars(base, vars);
}
