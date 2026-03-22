import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[#dbe4ef] bg-white p-5">
      <h2 className="text-[15px] font-bold tracking-[-0.02em] text-[#102a43]">{title}</h2>
      <div className="mt-3 space-y-2 text-[13px] leading-7 text-[#61758a]">{children}</div>
    </section>
  );
}

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
        <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-6">
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-full border border-[#dbe4ef] bg-[#f8fbff] px-3 text-[12px] font-semibold text-[#31527a]"
          >
            동의 화면으로 돌아가기
          </Link>
          <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#7b8fa6]">Terms</div>
          <h1 className="mt-2 text-[24px] font-bold tracking-[-0.03em] text-[#102a43]">이용약관</h1>
          <p className="mt-3 text-[13px] leading-7 text-[#61758a]">
            본 약관은 RNest가 제공하는 기록, 인사이트, AI 기능, 소셜 기능, 쇼핑 및 결제 관련 서비스 이용 조건을 설명합니다.
          </p>
          <div className="mt-3 text-[12px] text-[#7b8fa6]">최종 수정일: 2026년 3월 9일</div>
        </div>

        <div className="mt-4 space-y-4">
          <Section title="1. 서비스 범위">
            <p>RNest는 일정·건강 기록, 회복 플래너, AI 검색, 소셜 그룹 및 챌린지, 쇼핑과 주문 조회 기능을 제공합니다.</p>
            <p>일부 기능은 무료로 제공되며, 일부 기능은 Pro 구독 또는 별도 구매가 있어야 사용할 수 있습니다.</p>
          </Section>

          <Section title="2. 계정과 본인 책임">
            <p>로그인 계정과 계정 내 활동은 이용자 본인 책임으로 관리해야 합니다.</p>
            <p>타인의 계정을 무단 사용하거나, 허위 정보 입력, 서비스 운영을 방해하는 행위가 확인되면 이용이 제한될 수 있습니다.</p>
          </Section>

          <Section title="3. AI 기능 이용">
            <p>AI 검색 결과는 일반적인 참고 정보이며 의료행위, 진단, 처방 또는 응급 판단을 대체하지 않습니다.</p>
            <p>실제 복약, 치료, 시술, 근무 안전과 관련된 최종 판단은 이용자와 의료진 또는 소속 기관의 기준에 따라 이루어져야 합니다.</p>
          </Section>

          <Section title="4. 유료 플랜과 결제">
            <p>Pro 구독은 결제 승인 후 즉시 적용되며, 별도로 해지하지 않으면 다음 결제 주기에 자동 갱신될 수 있습니다.</p>
            <p>해지를 예약한 경우 현재 이용 기간 종료일까지는 유료 기능을 계속 사용할 수 있습니다.</p>
            <p>AI 검색 추가 크레딧 등 별도 구매 상품은 구매 화면 및 결제 안내에 표시된 조건을 따릅니다.</p>
          </Section>

          <Section title="5. 쇼핑, 주문, 환불">
            <p>쇼핑 주문의 결제, 배송, 환불, 교환, 클레임 처리 기준은 주문 상세 화면과 환불·반품 정책 페이지에 따릅니다.</p>
            <p>외부 링크로 연결되는 제휴 상품은 해당 판매처의 결제, 배송, 환불 정책이 우선 적용될 수 있습니다.</p>
          </Section>

          <Section title="6. 소셜 기능">
            <p>소셜 기능을 이용하면 프로필, 그룹, 공지, 챌린지, 참여 기록 등 일부 활동 정보가 다른 이용자에게 노출될 수 있습니다.</p>
            <p>공개 범위는 서비스 내 설정에 따라 달라질 수 있으며, 그룹 운영을 방해하거나 타인에게 위해를 주는 행위는 제한될 수 있습니다.</p>
          </Section>

          <Section title="7. 서비스 변경 및 제한">
            <p>RNest는 기능 개선, 보안, 법령 대응, 운영상 필요에 따라 서비스 내용, 가격, 제공 범위를 변경할 수 있습니다.</p>
            <p>시스템 점검, 외부 연동 장애, 결제사 또는 인프라 문제로 서비스 일부가 일시 중단될 수 있습니다.</p>
          </Section>

          <Section title="8. 면책">
            <p>이용자 입력 오류, 기기 문제, 네트워크 장애, 외부 서비스 장애로 발생한 손해에 대해서는 관련 법령이 허용하는 범위에서 책임이 제한될 수 있습니다.</p>
            <p>RNest는 이용자가 본 서비스 결과만을 근거로 내린 의료적, 업무적, 재정적 판단의 결과를 보증하지 않습니다.</p>
          </Section>

          <Section title="9. 문의">
            <p>약관, 결제, 환불, 쇼핑 관련 문의는 서비스 내 안내 또는 고객센터 이메일로 접수할 수 있습니다.</p>
            <p>사업자 및 고객센터 고지 정보는 쇼핑 페이지 하단 또는 별도 고지 화면을 따릅니다.</p>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
