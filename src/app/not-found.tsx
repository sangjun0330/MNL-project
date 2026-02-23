import Link from "next/link";

export const runtime = "edge";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-[720px] flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ios-text">404</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
        요청하신 페이지를 찾을 수 없습니다.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-white px-4 text-[13px] font-semibold text-ios-text"
      >
        홈으로 이동
      </Link>
    </main>
  );
}
