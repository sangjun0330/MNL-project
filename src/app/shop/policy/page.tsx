import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";

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
          <section className="rounded-3xl border border-[#edf1f6] bg-white p-5">
            <h2 className="text-[16px] font-bold text-[#111827]">교환 및 반품 기준</h2>
            <div className="mt-3 space-y-2 text-[13px] leading-6 text-[#44556d]">
              <p>• 배송 완료 후 <strong>7일 이내</strong>에 교환·반품 신청이 가능합니다.</p>
              <p>• 단순 변심의 경우 반품 배송비(왕복)는 고객 부담입니다.</p>
              <p>• 상품 하자·오배송의 경우 배송비 전액 당사 부담입니다.</p>
              <p>• 개봉 후 사용한 상품, 포장 훼손 시 교환·반품이 제한될 수 있습니다.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-[#edf1f6] bg-white p-5">
            <h2 className="text-[16px] font-bold text-[#111827]">결제 취소 및 환불 처리</h2>
            <div className="mt-3 space-y-2 text-[13px] leading-6 text-[#44556d]">
              <p>• 결제 당일 취소 시 즉시 승인 취소(실질적 미청구) 처리됩니다.</p>
              <p>• 결제 익일 이후 환불은 <strong>영업일 기준 3~5일</strong> 이내 원결제 수단으로 반환됩니다.</p>
              <p>• 카드 취소의 경우 카드사 정책에 따라 청구서에 반영되기까지 시간이 걸릴 수 있습니다.</p>
              <p>• 환불 요청은 쇼핑 탭의 주문 내역에서 직접 신청하거나 고객센터로 문의해 주세요.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-[#edf1f6] bg-white p-5">
            <h2 className="text-[16px] font-bold text-[#111827]">교환·반품 불가 사유</h2>
            <div className="mt-3 space-y-2 text-[13px] leading-6 text-[#44556d]">
              <p>• 고객 귀책 사유로 인한 상품 훼손, 오염, 분실</p>
              <p>• 개봉·사용으로 인해 상품 가치가 현저히 감소한 경우</p>
              <p>• 소비자 보호법 및 전자상거래법에서 정한 반품 불가 기간 경과</p>
              <p>• 주문 제작 또는 맞춤 제작된 상품</p>
            </div>
          </section>

          <section className="rounded-3xl border border-[#edf1f6] bg-white p-5">
            <h2 className="text-[16px] font-bold text-[#111827]">배송 안내</h2>
            <div className="mt-3 space-y-2 text-[13px] leading-6 text-[#44556d]">
              <p>• 결제 완료 후 <strong>1~3 영업일</strong> 이내 발송됩니다 (공휴일·주말 제외).</p>
              <p>• 도서·산간 지역은 추가 배송일이 소요될 수 있습니다.</p>
              <p>• 배송 시작 시 운송장 번호를 주문 상세 페이지에서 확인하실 수 있습니다.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-[#edf1f6] bg-white p-5">
            <h2 className="text-[16px] font-bold text-[#111827]">고객센터</h2>
            <div className="mt-3 space-y-2 text-[13px] leading-6 text-[#44556d]">
              <p>• 이메일: <a href="mailto:support@rnest.kr" className="text-[#3b6fc9] underline">support@rnest.kr</a></p>
              <p>• 운영 시간: 평일 09:00 ~ 18:00 (점심시간 12:00 ~ 13:00 제외)</p>
              <p>• 이메일 문의는 영업일 기준 1~2일 이내 순차 답변드립니다.</p>
            </div>
          </section>

          <div className="text-center text-[11px] text-[#8d99ab]">
            본 환불·반품 정책은 소비자보호법 및 전자상거래법을 준수합니다.<br/>
            최종 수정일: 2025년 1월 1일
          </div>
        </div>
      </div>
    </AppShell>
  );
}
