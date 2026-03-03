import { AppShell } from "@/components/shell/AppShell";

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
        <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-6">
          <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[#102a43]">개인정보처리방침</h1>
          <div className="mt-4 space-y-3 text-[13px] leading-7 text-[#61758a]">
            <p>쇼핑 기능에서는 배송지, 수령인, 연락처, 주문 및 결제 상태, 위시리스트, 장바구니 정보를 서비스 제공 목적 범위 내에서 저장합니다.</p>
            <p>배송지 정보는 결제 검증 및 배송 처리를 위해 사용되며, 주문 완료 후에도 주문 상세 확인을 위해 계정에 연결됩니다.</p>
            <p>보관된 쇼핑 관련 정보는 사용자가 계정에서 직접 확인하고 수정할 수 있습니다.</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
