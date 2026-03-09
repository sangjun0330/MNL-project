import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[#edf1f6] bg-white p-5">
      <h2 className="text-[16px] font-bold text-[#111827]">{title}</h2>
      <div className="mt-3 space-y-2 text-[13px] leading-6 text-[#44556d]">{children}</div>
    </section>
  );
}

export default function ShopPolicyPage() {
  return (
    <AppShell>
      <div className="-mx-4 pb-24">
        <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/shop" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label="쇼핑으로 돌아가기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M19 12H5" />
                <path d="M12 5l-7 7 7 7" />
              </svg>
            </Link>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">환불 및 반품 안내</h1>
          </div>
        </div>

        <div className="space-y-6 px-4 py-6">
          <PolicySection title="1. 주문 취소">
            <p>결제 전 상태 주문은 즉시 취소할 수 있습니다.</p>
            <p>결제 완료 주문은 발송 전이며 결제 승인 후 약 1시간 이내인 경우에 한해 즉시 취소가 가능할 수 있습니다.</p>
            <p>이미 발송이 시작된 주문, 즉시 취소 가능 시간이 지난 주문, 묶음 결제에 포함된 일부 주문은 즉시 취소가 제한되며 환불 또는 클레임 절차로 안내될 수 있습니다.</p>
          </PolicySection>

          <PolicySection title="2. 환불 요청">
            <p>환불 요청은 주문 상세 화면에서 접수할 수 있으며, 사유 입력이 필요할 수 있습니다.</p>
            <p>환불 요청이 접수되면 즉시 자동 환불되지 않고, 관리자 검토 및 처리 절차를 거칠 수 있습니다.</p>
            <p>승인된 환불은 원결제 수단으로 처리되며, 실제 반영 시점은 결제사·카드사 또는 금융기관 일정에 따라 달라질 수 있습니다.</p>
          </PolicySection>

          <PolicySection title="3. 배송 완료 후 교환·환불 클레임">
            <p>배송 완료 후 7일 이내에는 주문 상세에서 교환 또는 환불 클레임을 접수할 수 있습니다.</p>
            <p>동일 주문에는 동시에 여러 건의 진행 중 클레임을 둘 수 없으며, 처리 중인 클레임이 있으면 추가 요청이 제한될 수 있습니다.</p>
            <p>클레임은 접수, 승인, 반품 회수 접수, 반품 입고, 환불 완료 또는 교환품 발송 순으로 단계적으로 처리될 수 있습니다.</p>
          </PolicySection>

          <PolicySection title="4. 반품·교환 제한">
            <p>반품 가능 기간이 지난 경우, 이미 환불이 완료된 경우, 진행 중인 동일 주문 클레임이 있는 경우 요청이 제한될 수 있습니다.</p>
            <p>이용자 책임으로 상품이 훼손되었거나 사용 흔적이 큰 경우, 포장 또는 구성품이 현저히 손상된 경우에는 처리 범위가 제한될 수 있습니다.</p>
            <p>외부 판매처로 연결되는 상품은 해당 판매처의 환불·교환 정책이 우선 적용될 수 있습니다.</p>
          </PolicySection>

          <PolicySection title="5. 배송 안내">
            <p>결제 완료 후 상품 준비와 발송이 진행되며, 실제 출고 시점은 재고, 운영 일정, 공휴일, 제휴사 사정에 따라 달라질 수 있습니다.</p>
            <p>배송이 시작되면 주문 상세에서 운송장과 배송 상태를 확인할 수 있습니다.</p>
          </PolicySection>

          <PolicySection title="6. 고객 문의">
            <p>환불, 반품, 교환, 배송 관련 문의는 주문 상세 또는 고객센터 이메일로 접수할 수 있습니다.</p>
            <p>이메일: <a href="mailto:support@rnest.kr" className="text-[#3b6fc9] underline">support@rnest.kr</a></p>
          </PolicySection>

          <div className="text-center text-[11px] text-[#8d99ab]">
            본 정책은 현재 서비스 구현 기준으로 작성되었으며, 운영 정책 및 관련 법령에 따라 변경될 수 있습니다.<br />
            최종 수정일: 2026년 3월 9일
          </div>
        </div>
      </div>
    </AppShell>
  );
}
