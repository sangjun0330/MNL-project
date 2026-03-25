import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[#edf1f6] bg-white p-5">
      <h2 className="text-[16px] font-bold text-[#111827]">{title}</h2>
      <div className="mt-3 space-y-3 text-[13px] leading-6 text-[#44556d]">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
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
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">환불·반품 정책</h1>
          </div>
        </div>

        <div className="space-y-6 px-4 py-6">
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5 text-[13px] leading-6 text-[#44556d]">
            <div className="font-semibold text-[#111827]">적용 범위</div>
            <div className="mt-2">
              본 정책은 RNest가 직접 운영하는 앱 내 쇼핑 주문과 결제에 적용됩니다. 외부 판매처로 연결되어 최종 결제가
              외부에서 이루어지는 상품은 해당 판매처의 환불·교환·배송 정책이 우선 적용될 수 있습니다. 본 정책이 관련
              법령보다 소비자에게 불리한 경우에는 관련 법령이 우선합니다.
            </div>
          </div>

          <PolicySection title="1. 결제 전·결제 직후 주문 취소">
            <BulletList
              items={[
                "결제 전 상태(READY) 주문은 원칙적으로 즉시 취소할 수 있습니다.",
                "결제 완료 상태(PAID) 주문은 아직 발송되지 않았고 결제 승인 후 약 1시간 이내인 경우에 한해 서비스상 즉시 취소가 가능할 수 있습니다.",
                "이미 발송이 시작되었거나, 결제 후 즉시 취소 가능 시간이 지난 주문은 서비스상 즉시 취소가 제한되며 환불 요청 절차로 처리됩니다.",
                "한 번의 결제로 여러 상품이 함께 결제된 묶음 주문은 상품별 개별 즉시 취소가 제한될 수 있으며, 환불 요청 시 같은 결제 묶음 전체가 함께 접수될 수 있습니다.",
              ]}
            />
          </PolicySection>

          <PolicySection title="2. 환불 요청 접수 기준">
            <p>
              환불 요청은 주문 상세 화면에서 접수할 수 있으며, 구체적인 사유 입력이 필요합니다. RNest는 단순 변심,
              배송 지연, 오배송, 파손, 하자, 구성품 누락 등 개별 사정에 따라 환불 가능 여부와 비용 부담 주체를 판단합니다.
            </p>
            <BulletList
              items={[
                "환불 요청이 접수되었다고 해서 즉시 자동 환불되는 것은 아니며, 관리자 검토 또는 추가 확인 절차가 진행될 수 있습니다.",
                "이미 환불 요청이 접수된 주문은 동일한 사유로 중복 요청이 제한될 수 있습니다.",
                "환불은 원결제 수단으로 처리하는 것을 원칙으로 하며, 카드사·결제사·금융기관의 처리 시점에 따라 실제 환급 반영일은 달라질 수 있습니다.",
              ]}
            />
          </PolicySection>

          <PolicySection title="3. 배송 완료 후 반품·교환 클레임">
            <p>
              배송 완료 후 반품 또는 교환이 필요한 경우, 원칙적으로 배송 완료일로부터 7일 이내에 주문 상세에서 클레임을
              접수해야 합니다. RNest는 현재 주문당 동시에 하나의 진행 중 클레임만 허용합니다.
            </p>
            <BulletList
              items={[
                "진행 상태는 요청 접수, 승인, 반품 회수 접수, 반품 입고, 환불 완료 또는 교환품 발송 순으로 관리될 수 있습니다.",
                "사진, 개봉 상태, 하자 부위, 외부 박스 상태, 구성품 누락 여부 등 추가 자료 제출을 요청할 수 있습니다.",
                "교환 또는 환불 여부는 재고 상황, 상품 상태, 접수 사유, 법령상 청약철회 가능 여부, 판매자 귀책 여부를 종합해 판단합니다.",
              ]}
            />
          </PolicySection>

          <PolicySection title="4. 단순 변심 반품 기준">
            <BulletList
              items={[
                "단순 변심에 의한 반품은 관련 법령상 허용되는 범위에서 가능하나, 상품이 재판매 가능한 상태여야 하고 정해진 기간 내에 접수되어야 합니다.",
                "상품 내용 확인을 위한 범위의 포장 개봉만으로는 일률적으로 반품이 제한되지 않을 수 있으나, 사용 흔적이 있거나 가치가 현저히 감소한 경우에는 반품이 거절될 수 있습니다.",
                "단순 변심 반품의 경우 왕복 배송비, 초기 배송비 상당액, 포장 훼손이나 구성품 누락에 따른 손실금이 공제되거나 이용자 부담으로 처리될 수 있습니다.",
                "무료배송 주문이라도 반품 후 최종 구매금액이 무료배송 기준(현재 50,000원) 미만이 되면 최초 배송비가 차감될 수 있습니다.",
              ]}
            />
          </PolicySection>

          <PolicySection title="5. 반품·교환이 제한되는 경우">
            <p>다음 사유가 있는 경우, 관련 법령상 허용 범위에서 반품·교환 또는 청약철회가 제한될 수 있습니다.</p>
            <BulletList
              items={[
                "이용자 책임으로 상품이 멸실·훼손된 경우. 다만 상품 내용 확인을 위한 통상적 포장 훼손은 예외가 될 수 있습니다.",
                "이용자의 사용 또는 일부 소비로 상품 가치가 현저히 감소한 경우",
                "시간 경과로 재판매가 곤란할 정도로 가치가 감소한 경우",
                "복제가 가능한 상품의 포장을 훼손한 경우",
                "위생상품, 주문제작상품, 시즌성·신선식품, 디지털 콘텐츠 등 별도 고지된 제한 상품에 해당하는 경우",
                "반품 접수 가능 기간이 경과했거나, 동일 주문에 이미 진행 중인 클레임이 있는 경우",
                "구성품, 사은품, 증정품, 설명서, 라벨, 보호필름 등이 누락되거나 현저히 손상된 경우",
              ]}
            />
          </PolicySection>

          <PolicySection title="6. 판매자 귀책 사유가 있는 경우">
            <BulletList
              items={[
                "오배송, 배송 중 파손, 하자, 표시·광고와 다른 상품 수령, 중대한 구성품 누락 등 RNest 또는 판매자 귀책 사유가 확인되면 반품 배송비는 RNest가 부담하는 것을 원칙으로 합니다.",
                "다만 귀책 여부 판단을 위해 사진, 영상, 주문라벨, 박스 상태 등의 입증자료를 요청할 수 있으며, 자료가 부족한 경우 처리가 지연되거나 일부 제한될 수 있습니다.",
              ]}
            />
          </PolicySection>

          <PolicySection title="7. 반품 접수 및 발송 방법">
            <BulletList
              items={[
                "반품은 반드시 주문 상세 또는 고객지원 이메일을 통해 먼저 접수해 주세요.",
                "사전 승인 없이 착불 반송, 임의 반송, 주소 오기재 반송, 타 택배사 임의 접수 등이 이루어진 경우 추가 비용이 발생할 수 있습니다.",
                "승인 후 안내된 반품 절차, 반송지, 회수 방식에 따라 상품을 보내야 하며, 가능한 한 최초 수령 상태에 가깝게 재포장해 주세요.",
                "박스, 보호재, 구성품, 사은품, 설명서, 구매 증빙이 남아 있으면 함께 보내는 것이 확인에 유리합니다.",
              ]}
            />
          </PolicySection>

          <PolicySection title="8. 환불 처리 시점">
            <p>
              법령상 환불 의무가 발생한 경우 RNest는 원칙적으로 반품 상품을 수령·검수한 날 또는 반환이 필요 없는 환불 사유가
              확정된 날부터 3영업일 이내에 환불을 진행하거나, 지체 없이 결제사업자에게 취소·정지 요청을 하도록 처리합니다.
            </p>
            <BulletList
              items={[
                "실제 카드 승인 취소, 계좌 반영, 포인트 복원 등은 결제사·카드사·은행 일정에 따라 추가 시간이 소요될 수 있습니다.",
                "법령상 환불 지연에 해당하는 경우 관련 법령에 따른 지연배상금 책임이 발생할 수 있습니다.",
              ]}
            />
          </PolicySection>

          <PolicySection title="9. 배송 정책">
            <BulletList
              items={[
                "기본 배송비는 현재 3,000원이며, 주문 상품 합계가 50,000원 이상이면 기본 배송비는 자동으로 무료 처리됩니다.",
                "결제 완료 후 재고 확인, 상품 준비, 검수, 발송 등록이 진행되며 출고 시점은 재고, 운영 일정, 공휴일, 택배사 사정에 따라 달라질 수 있습니다.",
                "배송이 시작되면 주문 상세에서 운송장 및 배송 상태를 확인할 수 있습니다.",
                "도서산간 추가 배송비, 분리배송, 예약배송, 합배송 제한 등이 있는 경우에는 결제 전 별도 고지된 내용을 따릅니다.",
              ]}
            />
          </PolicySection>

          <PolicySection title="10. 외부 판매처 상품">
            <p>
              RNest 앱에서 소개하더라도 최종 결제가 외부 사이트에서 이루어지는 상품은 판매자, 결제, 배송, 환불, 교환,
              소비자분쟁 처리 기준이 해당 판매처의 정책과 약관을 우선 적용받습니다. RNest는 링크 중개 또는 소개 범위를
              넘어 외부 판매처의 계약 이행을 보증하지 않습니다.
            </p>
          </PolicySection>

          <PolicySection title="11. 문의와 증빙자료 보관">
            <BulletList
              items={[
                "환불, 반품, 교환, 배송 관련 문의는 주문 상세 또는 고객센터 이메일로 접수할 수 있습니다.",
                <>이메일: <a href="mailto:support@rnest.kr" className="text-[#3b6fc9] underline">support@rnest.kr</a></>,
                "분쟁 발생 시를 대비해 주문번호, 운송장, 수령 직후 사진, 박스 상태, 하자 부위 사진 등을 보관해 두는 것이 좋습니다.",
              ]}
            />
          </PolicySection>

          <div className="text-center text-[11px] leading-5 text-[#8d99ab]">
            본 정책은 RNest의 현재 서비스 구현 및 운영 기준을 반영한 것입니다.<br />
            관련 법령, 결제·배송 연동 구조, 판매 방식이 변경되면 정책도 함께 수정될 수 있습니다.<br />
            최종 수정일: 2026년 3월 25일
          </div>
        </div>
      </div>
    </AppShell>
  );
}
