import { AppShell } from "@/components/shell/AppShell";

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
        <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-6">
          <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[#102a43]">이용약관</h1>
          <div className="mt-4 space-y-3 text-[13px] leading-7 text-[#61758a]">
            <p>RNest 쇼핑 기능은 계정 기준으로 주문, 배송지, 위시리스트, 장바구니 정보를 저장합니다.</p>
            <p>결제 승인 이후 주문 상태는 주문 내역에서 확인할 수 있으며, 배송 완료 후 구매 확정을 마친 계정만 리뷰를 작성할 수 있습니다.</p>
            <p>구체적인 환불·반품 조건은 상품별 정책과 전자상거래 관련 법령을 따릅니다.</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
