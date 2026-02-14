# Med-Safety OpenAI Egress Proxy (`rnest.kr`)

## 목적
- `unsupported_country_region_territory` 오류를 줄이기 위해 `OPENAI_MED_SAFETY_FALLBACK_BASE_URL`에 고정 리전 프록시를 연결합니다.
- `med-safety` 서버는 이미 기본 OpenAI(`https://api.openai.com/v1`) 호출 실패 시 fallback base를 자동 재시도합니다.

## 권장 구조
1. 프록시 서버를 **지원 리전**(예: Tokyo/Singapore/US) VM/컨테이너에 배포
2. DNS로 `oai-proxy.rnest.kr` 연결
3. 앱 환경변수에 fallback base 등록

## 1) 프록시 코드
아래 파일을 별도 리포(또는 별도 디렉터리)로 배포하세요.

`server.mjs`
```js
import express from "express";

const app = express();
app.use(express.json({ limit: "20mb" }));

const ALLOWED = new Set(["/v1/responses", "/v1/chat/completions"]);

app.post("/v1/*", async (req, res) => {
  const path = req.path;
  if (!ALLOWED.has(path)) {
    return res.status(404).json({ error: "not_found" });
  }

  const auth = req.header("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ error: "missing_bearer" });
  }

  try {
    const upstream = await fetch(`https://api.openai.com${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: auth,
      },
      body: JSON.stringify(req.body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch {
    return res.status(502).json({ error: "upstream_failed" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`listening on ${port}`));
```

`package.json`
```json
{
  "name": "rnest-openai-egress-proxy",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.mjs"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
```

## 2) 배포 (예: Render)
1. Render 새 Web Service 생성
2. Region: `Singapore` 또는 `Oregon` 등 지원 리전 선택
3. Build command: `npm install`
4. Start command: `npm start`
5. HTTPS 기본 도메인 발급 확인

## 3) `rnest.kr` 도메인 연결
1. DNS에 `oai-proxy.rnest.kr` CNAME 추가
2. 대상: Render가 제공한 서비스 도메인
3. SSL 발급 완료 확인

## 4) WNL 앱 환경변수
Cloudflare Pages/배포 환경에 아래 설정:

```env
OPENAI_API_KEY=sk-...
OPENAI_MED_SAFETY_BASE_URL=https://api.openai.com/v1
OPENAI_MED_SAFETY_FALLBACK_BASE_URL=https://oai-proxy.rnest.kr/v1
OPENAI_MED_SAFETY_TIMEOUT_MS=180000
OPENAI_MED_SAFETY_PER_ATTEMPT_TIMEOUT_MS=12000
OPENAI_MED_SAFETY_MAX_OUTPUT_TOKENS=1800
```

설정 후 반드시 재배포하세요.

## 5) 확인 체크리스트
1. 와이파이 상태에서 `도구 > AI 약물·도구 검색기` 실행
2. 결과가 정상 생성되고, 지역 차단 메시지가 반복되지 않는지 확인
3. 프록시 로그에서 `/v1/responses` 또는 `/v1/chat/completions` 200 응답 확인

## 운영 권장
- 프록시는 IP allowlist 또는 Basic Auth + WAF 제한 권장
- 요청/응답 원문 로그는 저장하지 않는 정책 권장(민감 정보 최소화)
