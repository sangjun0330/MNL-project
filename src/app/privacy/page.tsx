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
          <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#7b8fa6]">Privacy</div>
          <h1 className="mt-2 text-[24px] font-bold tracking-[-0.03em] text-[#102a43]">개인정보처리방침</h1>
          <p className="mt-3 text-[13px] leading-7 text-[#61758a]">
            RNest는 서비스 제공에 필요한 범위에서만 이용자 정보를 처리하며, 실제 앱에서 사용하는 기능과 저장 구조를 기준으로 아래 내용을 안내합니다.
          </p>
          <div className="mt-3 text-[12px] text-[#7b8fa6]">최종 수정일: 2026년 3월 9일</div>
        </div>

        <div className="mt-4 space-y-4">
          <Section title="1. 처리하는 정보">
            <p>계정 및 인증: 사용자 식별값, 이메일 주소, 로그인 제공자 정보 등 계정 생성과 로그인에 필요한 정보.</p>
            <p>기록 및 개인화 정보: 일정, 메모, 감정, 바이오 입력, 생리주기 설정, 개인화 설정, 회복 관련 입력값.</p>
            <p>AI 관련 정보: AI 검색 실행에 필요한 입력 요약, 생성 결과, 일부 이력 및 캐시 데이터.</p>
            <p>소셜 정보: 닉네임, 아바타, 상태 메시지, 친구/그룹/챌린지 참여 정보, 공지 및 활동 기록, 공개 범위 설정.</p>
            <p>쇼핑 정보: 장바구니, 위시리스트, 배송지, 주문, 환불/교환 요청, 구매 확정, 주문 진행 상태.</p>
            <p>결제·배송 연동 정보: 결제 승인·취소 결과값, 주문 금액 및 상태, 운송장과 배송 조회에 필요한 정보.</p>
          </Section>

          <Section title="2. 이용 목적">
            <p>회원 식별과 로그인 유지, 기록 저장 및 동기화, 인사이트와 회복 플래너 제공, AI 결과 생성, 소셜 기능 운영, 상품 주문·결제·배송·환불 처리, 고객 문의 대응을 위해 사용합니다.</p>
          </Section>

          <Section title="3. 보관 및 삭제">
            <p>이용자 정보는 서비스 제공과 계정 유지에 필요한 기간 동안 보관됩니다.</p>
            <p>회원 탈퇴 시 계정, 사용자 상태, 일부 AI 저장 데이터는 삭제될 수 있습니다. 다만 결제, 주문, 분쟁 대응, 법령상 보존 의무가 있는 정보는 별도 보관되거나 즉시 삭제되지 않을 수 있습니다.</p>
          </Section>

          <Section title="4. 외부 서비스 연동">
            <p>RNest는 서비스 운영을 위해 외부 인증, 데이터 저장, AI 처리, 결제, 이메일 발송, 배송 조회 서비스와 연동될 수 있습니다.</p>
            <p>예를 들어 로그인과 데이터 저장은 인증·데이터 인프라, AI 기능은 AI 처리 서비스, 결제는 결제대행 서비스, 배송 조회는 배송 연동 서비스를 통해 처리될 수 있습니다.</p>
          </Section>

          <Section title="5. 결제 정보 처리">
            <p>RNest는 카드번호, 비밀번호 등 결제수단의 전체 민감정보를 직접 저장하지 않습니다.</p>
            <p>대신 결제 승인, 취소, 환불, 주문 확인에 필요한 결제 결과값과 상태 정보를 저장할 수 있습니다.</p>
          </Section>

          <Section title="6. 소셜 및 공개 범위">
            <p>소셜 기능 이용 시 닉네임, 아바타, 상태 메시지, 그룹 참여 여부, 챌린지 기록, 일부 일정·건강 요약 정보가 설정에 따라 다른 이용자에게 보일 수 있습니다.</p>
            <p>공개 범위는 서비스 내 설정에 따라 조정할 수 있으나, 이미 생성된 그룹 활동 기록이나 운영상 필요한 로그는 즉시 사라지지 않을 수 있습니다.</p>
          </Section>

          <Section title="7. 이용자 권리">
            <p>이용자는 서비스 내에서 자신의 정보 일부를 조회·수정할 수 있으며, 계정 삭제를 요청할 수 있습니다.</p>
            <p>주문, 결제, 환불, 소셜 활동 등 운영 또는 법적 보관이 필요한 정보는 요청 즉시 전부 삭제되지 않을 수 있습니다.</p>
          </Section>

          <Section title="8. 문의">
            <p>개인정보 처리와 관련한 문의는 서비스 내 고객 문의 창구 또는 고지된 고객센터 이메일로 접수할 수 있습니다.</p>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
