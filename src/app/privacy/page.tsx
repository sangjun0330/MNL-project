import Link from "next/link";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[#dbe4ef] bg-white p-5">
      <h2 className="text-[15px] font-bold tracking-[-0.02em] text-[#102a43]">{title}</h2>
      <div className="mt-3 space-y-3 text-[13px] leading-7 text-[#61758a]">{children}</div>
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

export default function Page() {
  return (
      <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
        <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-6">
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-full border border-[#dbe4ef] bg-[#f8fbff] px-3 text-[12px] font-semibold text-[#31527a]"
          >
            동의 화면으로 돌아가기
          </Link>
          <div className="mt-4 text-[12px] font-semibold uppercase tracking-[0.22em] text-[#7b8fa6]">Privacy</div>
          <h1 className="mt-2 text-[24px] font-bold tracking-[-0.03em] text-[#102a43]">개인정보처리방침</h1>
          <p className="mt-3 text-[13px] leading-7 text-[#61758a]">
            RNest는 서비스 제공에 필요한 범위에서만 개인정보를 처리하며, 실제 앱에서 제공되는 기록 저장, AI,
            소셜, 결제, 고객지원 기능을 기준으로 본 방침을 작성합니다.
          </p>
          <div className="mt-4 rounded-[20px] border border-[#e5edf6] bg-[#f8fbff] p-4 text-[12.5px] leading-6 text-[#52657a]">
            <div className="font-semibold text-[#214469]">중요 안내</div>
            <div className="mt-2">
              RNest는 기록 저장 및 AI 기능과 관련하여 별도의 필수 동의를 받고 있습니다. 이용자가 건강기록, 메모,
              이미지, 질문 등을 입력할 때에는 타인의 개인정보, 환자 식별정보, 법령상 제한된 정보를 입력하지 않도록
              주의해야 합니다.
            </div>
          </div>
          <div className="mt-3 text-[12px] text-[#7b8fa6]">최종 수정일: 2026년 3월 25일</div>
        </div>

        <div className="mt-4 space-y-4">
          <Section title="1. 처리하는 개인정보 항목">
            <BulletList
              items={[
                <><span className="font-semibold text-[#24415d]">계정·인증 정보:</span> 사용자 식별값, 이메일 주소, 로그인 제공자 정보, 인증 상태, 세션 관련 정보</>,
                <><span className="font-semibold text-[#24415d]">프로필·소셜 정보:</span> 닉네임, 아바타, 상태 메시지, 친구·그룹·챌린지·초대·알림·공개 범위 설정 정보</>,
                <><span className="font-semibold text-[#24415d]">기록·개인화 정보:</span> 일정, 메모, 감정 기록, 수면·낮잠·스트레스·활동·카페인·기분·증상·생리주기 관련 자가 입력 정보, 개인화 설정, 인사이트 계산에 필요한 상태값</>,
                <><span className="font-semibold text-[#24415d]">노트 및 첨부파일 정보:</span> 노트 문서, 템플릿, 기록 보기 데이터, 업로드한 파일의 메타데이터, 저장 경로, 파일 유형, 크기</>,
                <><span className="font-semibold text-[#24415d]">AI 관련 정보:</span> 질문 입력, AI 처리에 필요한 기록 요약, 업로드한 이미지, AI 응답 결과, 최근 이용 이력, 프롬프트 버전 및 실행 메타데이터</>,
                <><span className="font-semibold text-[#24415d]">결제 정보:</span> 결제 승인·취소·환불 결과값, 결제키 등 결제 확인과 정산에 필요한 요약 정보</>,
                <><span className="font-semibold text-[#24415d]">기술·보안 정보:</span> 접속 로그, IP 주소, 브라우저/기기 정보, 쿠키 또는 토큰, 오류 로그, 부정이용 방지를 위한 보안 관련 정보</>,
                <><span className="font-semibold text-[#24415d]">동의·문의 정보:</span> 서비스 동의 시각과 버전, 고객 문의 내용, 운영상 필요한 안내 발송 이력</>,
              ]}
            />
          </Section>

          <Section title="2. 개인정보 수집 방법">
            <BulletList
              items={[
                "회원가입, 로그인, 기록 입력, 고객 문의 등 이용자가 직접 입력하는 방식",
                "서비스 이용 과정에서 자동 생성되거나 계산되는 방식",
                "외부 로그인 제공자, 결제사업자 등 연동 서비스로부터 제공받는 방식",
              ]}
            />
          </Section>

          <Section title="3. 개인정보 이용 목적">
            <BulletList
              items={[
                "회원 식별, 로그인 유지, 계정 보안, 본인 확인",
                "일정·건강기록 저장, 동기화, 백업, 복구, 개인화 서비스 제공",
                "RNest Vital, 회복 플래너, 통계, 추천, AI 응답, 약물안전성/건강 관련 안내 제공",
                "소셜 연결, 그룹·챌린지 운영, 공개 범위 반영, 커뮤니티 안전관리",
                "유료 플랜 결제 승인 확인, 정산, 환불 처리",
                "문의 응대, 분쟁 해결, 공지 발송, 부정이용 방지, 법령 준수, 감사·보안 로그 관리",
              ]}
            />
            <p>
              RNest는 서비스 제공 요청의 이행, 정보주체의 동의, 관련 법령상 의무 준수, 보안과 안정적 운영을 위한 정당한
              필요 범위에서 개인정보를 처리합니다.
            </p>
          </Section>

          <Section title="4. 보유기간과 분리보관">
            <p>
              개인정보는 원칙적으로 처리 목적이 달성되거나 회원 탈퇴 시 지체 없이 삭제합니다. 다만 법령상 보존 의무가
              있거나 분쟁 대응, 부정이용 방지, 결제 정산, 환불 처리, 시스템 복구에 필요한 경우에는 해당 기간 동안 별도로
              보관할 수 있습니다.
            </p>
            <BulletList
              items={[
                "표시·광고에 관한 기록: 6개월",
                "계약 또는 청약철회 등에 관한 기록: 5년",
                "대금결제 및 재화 등의 공급에 관한 기록: 5년",
                "소비자의 불만 또는 분쟁처리에 관한 기록: 3년",
                "기타 관계 법령에서 별도 보존 기간을 정한 정보: 해당 법령이 정한 기간",
              ]}
            />
            <p className="rounded-[18px] bg-[#f8fbff] px-4 py-3 text-[12.5px] leading-6 text-[#52657a]">
              위 보존기간은 전자금융, 소비자 보호, 세무·회계 관련 법령상 기준을 반영한 것입니다. 백업본은 즉시 완전
              삭제되지 않고 다음 덮어쓰기 주기까지 합리적인 기간 동안 남을 수 있습니다.
            </p>
          </Section>

          <Section title="5. 개인정보의 파기 절차와 방법">
            <BulletList
              items={[
                "파기 사유가 발생한 개인정보는 지체 없이 삭제하거나, 별도 법정 보존이 필요한 경우 접근이 제한된 영역으로 분리합니다.",
                "전자적 파일은 복구가 어렵거나 불가능한 방식으로 삭제하며, 종이 문서는 분쇄 또는 소각 등 적절한 방식으로 파기합니다.",
                "법령상 보존 정보는 일반 운영 데이터와 분리하여 저장하고, 보존 목적 외의 용도로 이용하지 않습니다.",
              ]}
            />
          </Section>

          <Section title="6. 외부 수탁·연동 서비스">
            <p>RNest는 아래와 같은 외부 서비스와 연동하거나 처리를 위탁할 수 있습니다.</p>
            <BulletList
              items={[
                <><span className="font-semibold text-[#24415d]">Supabase</span>: 회원 인증, 데이터베이스, 스토리지, 서비스 상태 저장</>,
                <><span className="font-semibold text-[#24415d]">OpenAI / Cloudflare AI Gateway</span>: AI 응답 생성 및 AI 요청 라우팅</>,
                <><span className="font-semibold text-[#24415d]">Toss Payments</span>: 결제 승인, 결제 취소, 환불 처리</>,
                <><span className="font-semibold text-[#24415d]">Resend</span>: 결제·환불 등 거래성 이메일 발송</>,
              ]}
            />
            <p>
              RNest는 서비스 운영상 필요에 따라 동종 또는 동급의 수탁사·연동사를 변경할 수 있으며, 중요한 변경이 있는
              경우 관련 법령과 본 방침에 따라 고지합니다.
            </p>
          </Section>

          <Section title="7. 제3자 제공">
            <p>
              RNest는 원칙적으로 개인정보를 외부에 판매하거나 임대하지 않습니다. 다만 아래의 경우에는 서비스 이행에
              필요한 범위 내에서 제공될 수 있습니다.
            </p>
            <BulletList
              items={[
                "결제 처리: 결제 승인, 결제 취소, 환불, 부정거래 탐지를 위해 결제사업자 및 관련 금융기관에 필요한 정보 제공",
                "법령상 의무: 법원, 수사기관, 감독기관 등의 적법한 요구가 있는 경우",
              ]}
            />
          </Section>

          <Section title="8. 국외 이전 가능성">
            <p>
              RNest는 클라우드 저장, AI 처리, 이메일 발송 등 서비스 운영 과정에서 국외 이전이 발생할 수 있는 외부 서비스를
              사용합니다. 이전은 서비스 이용 시점에 암호화된 네트워크를 통하여 이루어질 수 있으며, 이전되는 국가는 미국
              또는 각 제공자의 글로벌 인프라 운영 지역일 수 있습니다.
            </p>
            <BulletList
              items={[
                "기록 저장 및 동기화, AI 기능 사용에 대한 별도 동의 화면에서 국외 이전 사실과 거부 시 불이익을 안내합니다.",
                "국외 이전을 원하지 않는 경우 관련 기능 이용이 제한될 수 있으며, 필수 기능의 경우 서비스 제공이 어려울 수 있습니다.",
              ]}
            />
          </Section>

          <Section title="9. 정보주체의 권리와 행사 방법">
            <BulletList
              items={[
                "이용자는 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지, 동의 철회, 계정 삭제를 요청할 수 있습니다.",
                "일부 정보는 서비스 내에서 직접 수정·삭제할 수 있으며, 그 외 요청은 고객지원 이메일로 접수할 수 있습니다.",
                "법령상 보존 의무가 있거나 타인의 권리·안전을 침해할 우려가 있는 경우, 요청이 전부 수용되지 않거나 처리 시기가 조정될 수 있습니다.",
              ]}
            />
          </Section>

          <Section title="10. 쿠키·세션·자동수집 장치">
            <p>
              RNest는 로그인 유지, 보안 검증, 요청 무결성 확인, 사용자 상태 유지 등을 위해 쿠키, 세션 토큰 또는 이와
              유사한 기술을 사용할 수 있습니다.
            </p>
            <BulletList
              items={[
                "필수 기능 구현을 위한 쿠키·토큰은 비활성화할 경우 로그인, 결제, 동기화 기능이 제대로 동작하지 않을 수 있습니다.",
                "현재 RNest는 별도 고지 없는 맞춤형 광고 쿠키를 기본 기능으로 사용하지 않습니다.",
              ]}
            />
          </Section>

          <Section title="11. 안전성 확보조치">
            <BulletList
              items={[
                "접근 권한 최소화 및 관리자 권한 통제",
                "전송 구간 보호, 인증·인가 절차 운영, 보안 로그 확인",
                "민감 입력 마스킹, 오류·오남용 감지, 운영상 필요한 점검과 모니터링",
              ]}
            />
            <p>
              다만 인터넷 환경의 특성상 절대적인 보안을 보장할 수는 없으며, RNest는 합리적인 수준의 보호조치를 지속적으로
              개선합니다.
            </p>
          </Section>

          <Section title="12. 아동의 개인정보">
            <p>
              만 14세 미만 아동은 법정대리인의 동의 없이 회원가입 또는 유료서비스 이용이 제한될 수 있습니다. RNest는
              필요한 경우 연령 확인이나 법정대리인 동의 확인을 요청할 수 있으며, 적법한 동의 확인이 어려운 경우 관련
              계정 또는 정보 처리를 제한할 수 있습니다.
            </p>
          </Section>

          <Section title="13. 개인정보처리방침 변경">
            <p>
              본 방침은 관련 법령, 서비스 구조, 처리 항목, 외부 연동, 운영정책 변경에 따라 수정될 수 있습니다. 중요한
              변경이 있는 경우 서비스 화면 또는 적절한 방법으로 사전 고지합니다.
            </p>
            <BulletList
              items={[
                "단순 오탈자 수정, 표현 명확화, 법령 인용 최신화 등은 시행일 전후로 바로 반영될 수 있습니다.",
                "처리 목적, 항목, 제3자 제공, 수탁, 권리 행사, 보유기간 등 중요한 변경은 시행일 전 충분한 기간 동안 고지합니다.",
              ]}
            />
          </Section>

          <Section title="14. 개인정보 보호 문의처">
            <BulletList
              items={[
                "개인정보 보호 문의부서: RNest 고객지원팀",
                <>이메일: <a href="mailto:support@rnest.kr" className="font-semibold text-[#31527a] underline">support@rnest.kr</a></>,
                "서비스 일반 문의와 개인정보 관련 문의는 동일 창구로 접수될 수 있으며, 필요한 경우 관련 담당자에게 전달됩니다.",
              ]}
            />
          </Section>
        </div>
      </div>
  );
}
