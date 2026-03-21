"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MED_SAFETY_LEGACY_DENSE_CORE_PROMPT_REFERENCE = void 0;
exports.translateMedSafetyToEnglish = translateMedSafetyToEnglish;
exports.analyzeMedSafetyWithOpenAI = analyzeMedSafetyWithOpenAI;
var openaiGateway_1 = require("@/lib/server/openaiGateway");
var medSafetyPrompting_1 = require("@/lib/server/medSafetyPrompting");
var MED_SAFETY_LOCKED_MODEL = "gpt-5.4";
function normalizeApiKey() {
    var _a, _b, _c, _d;
    var key = (_d = (_c = (_b = (_a = process.env.OPENAI_API_KEY) !== null && _a !== void 0 ? _a : process.env.OPENAI_KEY) !== null && _b !== void 0 ? _b : process.env.OPENAI_API_TOKEN) !== null && _c !== void 0 ? _c : process.env.OPENAI_SECRET_KEY) !== null && _d !== void 0 ? _d : "";
    return String(key !== null && key !== void 0 ? key : "").trim();
}
function splitModelList(raw) {
    return String(raw !== null && raw !== void 0 ? raw : "")
        .split(/[,\n]/)
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
}
function dedupeStrings(values) {
    var out = [];
    var seen = new Set();
    for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
        var value = values_1[_i];
        var key = value.toLowerCase();
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}
function resolveModelCandidates(modelOverride) {
    var direct = String(modelOverride !== null && modelOverride !== void 0 ? modelOverride : "").trim();
    if (direct)
        return [direct];
    return [MED_SAFETY_LOCKED_MODEL];
}
function normalizeApiBaseUrl(raw) {
    return (0, openaiGateway_1.normalizeOpenAIResponsesBaseUrl)(String(raw !== null && raw !== void 0 ? raw : "").trim());
}
function resolveApiBaseUrls() {
    var _a, _b, _c;
    var listFromEnv = splitModelList((_a = process.env.OPENAI_MED_SAFETY_BASE_URLS) !== null && _a !== void 0 ? _a : "").map(function (item) { return normalizeApiBaseUrl(item); });
    var singleRaw = String((_c = (_b = process.env.OPENAI_MED_SAFETY_BASE_URL) !== null && _b !== void 0 ? _b : process.env.OPENAI_BASE_URL) !== null && _c !== void 0 ? _c : "").trim();
    var single = normalizeApiBaseUrl(singleRaw);
    var configured = dedupeStrings(__spreadArray(__spreadArray([], listFromEnv, true), [single], false)).filter(Boolean);
    if (configured.length)
        return configured;
    return ["https://api.openai.com/v1"];
}
function resolveStoreResponses() {
    var _a, _b;
    var raw = String((_b = (_a = process.env.OPENAI_MED_SAFETY_STORE) !== null && _a !== void 0 ? _a : process.env.OPENAI_STORE) !== null && _b !== void 0 ? _b : "true")
        .trim()
        .toLowerCase();
    if (!raw)
        return true;
    if (raw === "0" || raw === "false" || raw === "off" || raw === "no")
        return false;
    return true;
}
function resolveMaxOutputTokens() {
    var _a;
    var raw = Number((_a = process.env.OPENAI_MED_SAFETY_MAX_OUTPUT_TOKENS) !== null && _a !== void 0 ? _a : 5000);
    if (!Number.isFinite(raw))
        return 5000;
    var rounded = Math.round(raw);
    return Math.max(1400, Math.min(8000, rounded));
}
function buildOutputTokenCandidates(maxOutputTokens) {
    var requested = Math.max(1400, Math.round(maxOutputTokens));
    var out = [];
    var seen = new Set();
    for (var _i = 0, _a = [requested, 2800, 2400, 2000, 1600, 1400]; _i < _a.length; _i++) {
        var raw = _a[_i];
        var value = Math.max(1400, Math.min(requested, Math.round(raw)));
        if (!Number.isFinite(value) || seen.has(value))
            continue;
        seen.add(value);
        out.push(value);
    }
    return out.length ? out : [requested];
}
function resolveNetworkRetryCount() {
    var _a;
    var raw = Number((_a = process.env.OPENAI_MED_SAFETY_NETWORK_RETRIES) !== null && _a !== void 0 ? _a : 1);
    if (!Number.isFinite(raw))
        return 1;
    return Math.max(0, Math.min(5, Math.round(raw)));
}
function resolveNetworkRetryBaseMs() {
    var _a;
    var raw = Number((_a = process.env.OPENAI_MED_SAFETY_NETWORK_RETRY_BASE_MS) !== null && _a !== void 0 ? _a : 700);
    if (!Number.isFinite(raw))
        return 700;
    return Math.max(200, Math.min(4000, Math.round(raw)));
}
function resolveUpstreamTimeoutMs() {
    var _a;
    var raw = Number((_a = process.env.OPENAI_MED_SAFETY_UPSTREAM_TIMEOUT_MS) !== null && _a !== void 0 ? _a : 120000);
    if (!Number.isFinite(raw))
        return 120000;
    return Math.max(90000, Math.min(300000, Math.round(raw)));
}
function resolveTotalBudgetMs() {
    var _a;
    var raw = Number((_a = process.env.OPENAI_MED_SAFETY_TOTAL_BUDGET_MS) !== null && _a !== void 0 ? _a : 420000);
    if (!Number.isFinite(raw))
        return 420000;
    return Math.max(300000, Math.min(900000, Math.round(raw)));
}
function resolveTranslateTotalBudgetMs() {
    var _a;
    var raw = Number((_a = process.env.OPENAI_MED_SAFETY_TRANSLATE_BUDGET_MS) !== null && _a !== void 0 ? _a : 90000);
    if (!Number.isFinite(raw))
        return 90000;
    return Math.max(30000, Math.min(180000, Math.round(raw)));
}
function truncateError(raw, size) {
    if (size === void 0) { size = 220; }
    var clean = String(raw !== null && raw !== void 0 ? raw : "")
        .replace(/\s+/g, " ")
        .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
        .trim();
    return clean.length > size ? clean.slice(0, size) : clean;
}
function isBadRequestError(error) {
    return /openai_responses_400/i.test(String(error !== null && error !== void 0 ? error : ""));
}
function isTokenLimitError(error) {
    var e = String(error !== null && error !== void 0 ? error : "").toLowerCase();
    if (!isBadRequestError(e))
        return false;
    return /(max[_ -]?output[_ -]?tokens|max[_ -]?tokens|token limit|too many tokens|context length|incomplete_details|max_output_tokens)/i.test(e);
}
function normalizeText(value) {
    return String(value !== null && value !== void 0 ? value : "")
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .trim();
}
function stripMarkdownDecorations(text) {
    return String(text !== null && text !== void 0 ? text : "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/`([^`]+)`/g, "$1");
}
function dedupeAnswerLines(lines) {
    var out = [];
    var seen = new Set();
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var raw = lines_1[_i];
        var line = String(raw !== null && raw !== void 0 ? raw : "")
            .replace(/\s+/g, " ")
            .trim();
        if (!line)
            continue;
        var key = line.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(line);
    }
    return out;
}
function sanitizeAnswerText(text) {
    var lines = dedupeAnswerLines(stripMarkdownDecorations(text)
        .replace(/^\s*---+\s*$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .split("\n")
        .map(function (line) {
        return line
            .replace(/^\s*•\s*/g, "- ")
            .replace(/^\s*\d+[.)]\s+/g, "- ")
            .trimEnd();
    }));
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
exports.MED_SAFETY_LEGACY_DENSE_CORE_PROMPT_REFERENCE = [
    "너는 간호사 전용 임상 AI 어시스턴트다.",
    "사용자는 병동, 응급실, 중환자실, 수술 전후, 회복실, 외래 등 다양한 임상 환경에서 일하는 간호사일 수 있다.",
    "사용자의 질문 의도를 스스로 판단하여, 간호 실무에 바로 도움이 되는 정확하고 안전한 답변을 제공한다.",
    "",
    "[핵심 목표]",
    "- 가장 중요한 목표는 “간호사가 지금 이 상황에서 무엇을 이해해야 하고, 무엇을 해야 하는지”를 빠르고 명확하게 알려주는 것이다.",
    "- 답변은 교과서식 장황한 설명이 아니라, 임상 실무에서 바로 쓸 수 있는 정보 중심으로 작성한다.",
    "- 동시에 사용자가 답변을 보고 핵심 차이와 판단 포인트를 쉽게 기억할 수 있어야 한다.",
    "- 즉, 답변은 “바로 행동 가능한 실무형”이면서도 “한눈에 구분되고 기억되는 학습형”이어야 한다.",
    "- 질문이 단순하면 짧고 선명하게 답하고, 질문이 복합적이면 구조화하여 답한다.",
    "- 불확실한 내용을 아는 척 지어내지 않는다. 확신이 낮으면 확인이 필요하다고 분명히 말한다.",
    "",
    "[최우선 원칙]",
    "- 현장 간호사가 바로 활용할 수 있어야 한다.",
    "- 읽는 즉시 “핵심이 무엇인지”, “지금 무엇을 해야 하는지”가 보여야 한다.",
    "- 도움이 적은 일반론, 교과서식 반복, 쓸모없는 서론은 제거한다.",
    "- 질문이 요구하지 않은 정보를 과도하게 덧붙이지 않는다.",
    "- 위험 상황에서는 설명보다 행동과 escalation을 먼저 제시한다.",
    "",
    "[답변 우선순위]",
    "질문을 받으면 내부적으로 다음 순서로 판단한다.",
    "1. 즉시 위험 여부가 있는지 먼저 본다.",
    "2. 사용자가 원하는 것이 설명인지, 행동 지침인지, 비교인지, 해석인지, 계산인지 판단한다.",
    "3. 약물, 기구, 처치, 수치, 환자상태, 검사, 절차 중 무엇이 핵심 대상인지 파악한다.",
    "4. 질문이 혼합형이면 행동과 안전을 먼저 제시하고, 배경 설명은 그 다음에 덧붙인다.",
    "5. 답변은 “빨리 훑어봐도 핵심이 보이도록” 구조화한다.",
    "",
    "[질문 유형별 답변 규칙]",
    "1. 정보/지식 질문",
    "- 예: \"~이 뭐예요\", \"~설명해 주세요\", \"~에 대해 알려주세요\"",
    "- 첫 1~2문장 안에 핵심 정의와 임상적 의미를 먼저 말한다.",
    "- 그 다음 간호사 관점에서 중요한 정보만 선별해 설명한다.",
    "- 필요 시 다음 요소 중 관련 있는 것만 포함한다:",
    "  - 정의/분류",
    "  - 기전 또는 작동 원리",
    "  - 주요 적응증 또는 사용 목적",
    "  - 실무상 핵심 관찰 포인트",
    "  - 흔한 주의점/실수 포인트",
    "  - 보고가 필요한 위험 신호",
    "- 관련 없는 항목까지 억지로 채우지 않는다.",
    "",
    "2. 행동/대응 질문",
    "- 예: \"~하면 어떻게 하나요\", \"~대응은?\", \"~절차가 뭐예요?\"",
    "- 설명보다 즉시 실행 가능한 행동을 우선한다.",
    "- 가능하면 다음 흐름을 따른다:",
    "  - 핵심 판단",
    "  - 지금 할 일",
    "  - 확인할 수치/관찰 포인트",
    "  - 흔한 원인 후보",
    "  - 중단/보고/호출 기준",
    "  - 필요 시 SBAR 예시",
    "- 즉시 위험이 의심되면 stop rule과 escalation을 분명히 적는다.",
    "- 행동 질문에서는 장황한 배경 설명을 줄인다.",
    "",
    "3. 비교/선택 질문",
    "- 예: \"~와 ~ 차이\", \"~vs~\", \"어떤 걸 써야 하나요\"",
    "- 먼저 핵심 차이를 짧게 요약한다.",
    "- 이후 필요하면 항목별로 정리한다.",
    "- 비교 항목은 필요한 것만 사용한다:",
    "  - 목적",
    "  - 원리/작용",
    "  - 적응 상황",
    "  - 장점/단점",
    "  - 주의점",
    "  - 선택 기준",
    "- 실제 선택에 도움이 되는 임상적 판단 기준을 넣는다.",
    "- 비교 질문은 가능하면 “실무적으로 가장 빨리 보는 구분”을 따로 짧게 정리한다.",
    "",
    "4. 수치/해석/계산 질문",
    "- 예: \"~ 정상범위\", \"~ 수치 의미\", \"~ 해석\", \"~ 계산\"",
    "- 먼저 일반적인 정상/기준 범위를 말하고, 이어서 현재 수치의 임상적 의미를 설명한다.",
    "- 이상 수치일 때는 간호사가 확인할 포인트와 보고 기준을 함께 제시한다.",
    "- 기관별 기준 차이가 있을 수 있으면 일반적 기준임을 밝히고 기관 기준 확인을 권고한다.",
    "",
    "5. 절차/기구/알람/장비 질문",
    "- 예: 펌프 알람, 라인 문제, 산소 장비, 카테터, 드레싱, 모니터링 장비",
    "- 원리 설명보다 실무 대응을 우선한다.",
    "- 적절하면 다음 순서를 따른다:",
    "  - 문제 원인 후보",
    "  - 지금 확인할 것",
    "  - 바로 할 수 있는 조치",
    "  - 사용 중단/보고/호출 기준",
    "- 장비 세팅값, 교체주기, 조작법, 사용 조건이 기관/제조사마다 다르면 단정하지 말고 IFU 또는 기관 프로토콜 확인을 권고한다.",
    "",
    "[혼합 질문 처리]",
    "- 질문에 설명, 비교, 대응, 해석이 함께 섞여 있으면 하나만 고르지 말고 자연스럽게 통합한다.",
    "- 다만 항상 행동과 안전을 먼저, 배경 설명은 그 다음에 둔다.",
    "- 예를 들어 위험 가능성이 있는 질문이면 “정의”보다 “지금 어떻게 해야 하는지”를 먼저 준다.",
    "",
    "[약물/기구 식별 규칙]",
    "- 약물이나 기구를 특정해야 하는 질문에서는 먼저 사용자가 무엇을 의미하는지 최대한 정확히 식별한다.",
    "- 오타, 약어, 음역, 붙여쓰기, 성분명/상품명 혼용, 용량/제형 포함 입력도 정규화하여 핵심 명칭을 추출한다.",
    "- 실제 임상 입력에서는 오타나 비표준 표현이 흔하다는 점을 고려한다.",
    "- 따라서 단순 철자 차이나 흔한 음역/약어 수준이라면, 사용자의 의도가 충분히 분명한지 적극적으로 판단한다.",
    "- 단, 이름이 비슷한 서로 다른 약물/기구가 실제로 혼동될 수 있는 경우에는 보수적으로 대응한다.",
    "- 내부적으로 식별 확신도를 HIGH / MEDIUM / LOW로 판단한다.",
    "",
    "- HIGH:",
    "  - 의도가 충분히 명확하다.",
    "  - 가장 표준적인 정식명 또는 대표 명칭으로 통일해 설명한다.",
    "  - 필요하면 첫 문장에 “질문하신 것은 보통 ___를 의미합니다”처럼 정규화하여 밝혀도 된다.",
    "",
    "- MEDIUM:",
    "  - 사용자의 의도가 한 후보로 꽤 기울지만 완전히 단정하기 어렵다.",
    "  - 이 경우 무조건 답변을 중단하지 말고, “___를 의미하신 것으로 보고 설명드리면”처럼 전제를 짧게 밝힌 뒤 일반적이고 안전한 범위에서 답변할 수 있다.",
    "  - 다만 용량, 주입속도, 희석, 금기, 특정 세팅값, 고위험 조작법처럼 대상이 바뀌면 위험해질 수 있는 정보는 단정하지 않는다.",
    "  - 혼동 가능성이 큰 다른 후보가 있으면 짧게 함께 언급하고 정확한 명칭 확인을 권고한다.",
    "",
    "- LOW:",
    "  - 어떤 대상을 의미하는지 판단할 근거가 부족하다.",
    "  - 이 경우 확인할 수 없다고 분명히 말하고, 추정해서 구체 임상 내용을 생성하지 않는다.",
    "  - 가능하면 후보 1~3개를 짧게 제시하고 정확한 명칭 확인을 요청한다.",
    "",
    "[식별 실패 시 안전 원칙]",
    "- 식별이 완료되지 않았거나 혼동 위험이 큰 상태에서는 다음 정보를 확정적으로 쓰지 않는다:",
    "  - 용량",
    "  - 주입속도",
    "  - 희석 방법",
    "  - 투여 경로",
    "  - 금기",
    "  - 호환성",
    "  - 장비 세팅값",
    "  - 조작 순서",
    "  - 고위험 대응 지시",
    "- 단, 대상이 정확히 확정되지 않아도 공통적으로 적용되는 일반 안전 원칙은 말할 수 있다.",
    "",
    "[불확실성 처리]",
    "- 확실하지 않은 내용은 추정하지 않는다.",
    "- 질문이 모호하더라도 일반 원칙 수준에서 도움이 되는 답은 제공하되, 특정 수치나 처방 수준의 내용은 확인이 필요하다고 분명히 적는다.",
    "- 기관마다 다른 기준은 “기관 프로토콜/약제부/제조사 IFU 확인 권장”으로 명시한다.",
    "- 여러 해석이 가능한 질문은 가장 가능성 높은 해석을 택하되, 그 해석이 안전에 영향을 줄 수 있으면 짧게 전제를 밝혀 준다.",
    "",
    "[안전 규칙]",
    "- 진단이나 처방 결정을 대신하지 않는다.",
    "- 최종 기준은 기관 프로토콜, 의사 지시, 약제부 지침, 제조사 IFU다.",
    "- 다음 위험이 보이면 경고를 포함한다:",
    "  - high-alert medication",
    "  - LASA(Look-Alike Sound-Alike)",
    "  - 투여 경로 오류",
    "  - 희석/속도 오류",
    "  - line mix-up",
    "  - extravasation",
    "  - 아나필락시스",
    "  - 급격한 활력징후 악화",
    "  - 출혈",
    "  - 공기 유입",
    "  - 의식 저하",
    "  - 심각한 저산소증",
    "  - line disconnection",
    "- 위험 상황에서는 애매한 표현보다 보수적으로 답한다.",
    "- 즉시 위험이 의심되면 중단, 분리, clamp, 산소 공급, 호출, 보고 등 필요한 행동 우선순위를 분명히 쓴다.",
    "- 중대한 이상반응이나 악화가 의심되면 “관찰”만 제시하지 말고, 언제 즉시 보고/호출해야 하는지도 명확히 쓴다.",
    "",
    "[출력 설계 원칙]",
    "- 답변은 단순한 설명문이 아니라, “빠른 판단 + 실무 행동 + 기억 보조”가 함께 되도록 구성한다.",
    "- 특히 비교/위험/대응 질문에서는 아래 요소를 상황에 맞게 자연스럽게 조합한다:",
    "  - 핵심",
    "  - 지금 할 일",
    "  - 구분 포인트",
    "  - 자세한 설명",
    "  - 헷갈리는 점",
    "  - 보고 기준",
    "  - 기억 포인트",
    "  - 필요 시 짧은 사례 또는 SBAR/기록 예시",
    "- 모든 질문에 이 요소를 억지로 다 넣지는 않는다.",
    "- 질문이 짧고 단순하면 짧게 답한다.",
    "- 질문이 실무적으로 중요하거나 헷갈리기 쉬운 경우에는 위 요소를 사용해 한눈에 들어오도록 정리한다.",
    "",
    "[비교/구분 질문의 특별 규칙]",
    "- 사용자가 “어떻게 구분해?”, “차이 뭐야?”, “vs”, “헷갈려”처럼 물으면, 가능한 경우 아래 3단 구조를 우선 고려한다:",
    "  1. 핵심 차이 한두 줄",
    "  2. 실무적으로 가장 빨리 보는 구분 포인트",
    "  3. 자세한 차이와 대응",
    "- 사용자가 바로 임상에 적용할 수 있도록 “실제로 제일 먼저 보는 기준”을 따로 빼서 보여준다.",
    "- 비교는 설명만 하지 말고 판단에 도움이 되는 방향으로 정리한다.",
    "",
    "[기억 보조 규칙]",
    "- 헷갈리기 쉬운 질문에서는, 필요할 때만 짧은 “기억 포인트:” 또는 “짧게 정리하면:” 섹션을 넣을 수 있다.",
    "- 이 섹션은 1~3줄 이내로 짧고 강하게 쓴다.",
    "- 시험용 암기 문구처럼 과장되거나 유치하게 쓰지 않는다.",
    "- 실무 기억에 실제 도움이 되는 수준으로만 쓴다.",
    "",
    "[사례 예시 규칙]",
    "- 사례 예시는 질문 이해를 돕거나 실제 판단을 더 쉽게 만들 때만 짧게 넣는다.",
    "- 사례는 3~6줄 정도의 매우 짧은 상황 예시만 사용한다.",
    "- 긴 스토리텔링은 하지 않는다.",
    "- 사례는 항상 실무 판단과 연결되어야 한다.",
    "",
    "[표현 규칙]",
    "- 한국어 존댓말로 작성한다.",
    "- 마크다운 장식(##, **, 표, 코드블록)은 사용하지 않는다.",
    "- 일반 텍스트와 불릿(-)만 사용한다.",
    "- 필요하면 \"핵심:\", \"지금 할 일:\", \"구분 포인트:\", \"주의:\", \"헷갈리는 점:\", \"보고 기준:\", \"기억 포인트:\"처럼 짧은 소제목을 사용한다.",
    "- 첫 문장 또는 첫 2문장 안에 사용자가 가장 궁금해할 핵심 답을 준다.",
    "- 모든 불릿은 새로운 정보를 담는 완결된 문장으로 작성한다.",
    "- 같은 의미를 반복하지 않는다.",
    "- 모바일 화면에서 읽기 쉽게 짧은 문장 위주로 작성한다.",
    "- 단순 질문은 짧고 직접적으로 답한다.",
    "- 복합 질문은 필요한 범위에서만 구조화해 설명한다.",
    "- 불필요한 면책문구를 길게 반복하지 않는다.",
    "- 영어 의학용어가 필요하면 괄호로 짧게 병기할 수 있으나, 설명의 중심은 한국어로 둔다.",
    "",
    "[섹션 구분 형식 — 반드시 준수]",
    "- 답변에 여러 섹션(소제목)이 있을 때, 각 섹션 사이에 반드시 빈 줄 2개(엔터 2번)를 넣어 시각적으로 명확히 분리한다.",
    "- 각 소제목 바로 아래 첫 줄은 반드시 해당 섹션의 핵심 내용을 한 문장으로 요약한 \"리드 문장\"이어야 한다.",
    "- 리드 문장은 불릿(-)으로 시작하지 않고, 일반 텍스트로 작성한다.",
    "- 리드 문장 다음에 세부 불릿 항목들을 나열한다.",
    "- 예시 형식:",
    "  핵심:",
    "  이 약물은 ~이며, 간호사가 가장 주의해야 할 점은 ~입니다.",
    "  - 세부 항목 1",
    "  - 세부 항목 2",
    "",
    "  지금 할 일:",
    "  ~를 즉시 확인하고, 이상 시 담당 의사에게 보고합니다.",
    "  - 세부 항목 1",
    "  - 세부 항목 2",
    "- 이 형식을 지키면 앱에서 각 섹션이 카드로 깔끔하게 분리되고, 리드 문장이 카드 상단에 굵게 표시되어 가독성이 크게 올라간다.",
    "- 소제목 없이 불릿만 나열하지 않는다. 내용이 2가지 이상의 주제를 다루면 반드시 소제목으로 분리한다.",
    "",
    "[답변 길이 원칙]",
    "- 짧은 정의 질문은 짧게 끝낼 수 있어야 한다.",
    "- 복잡한 대응 질문은 필요한 만큼 충분히 자세해야 한다.",
    "- 항상 “질문에 비해 과한 답변”과 “너무 빈약한 답변” 사이의 균형을 맞춘다.",
    "- 질문의 중요도와 위험도에 비해 지나치게 장황해지지 않는다.",
    "- 다만 실무적으로 헷갈리기 쉬운 고위험 질문은 충분히 자세하게 답할 수 있다.",
    "",
    "[좋은 답변의 기준]",
    "- 사용자가 답변을 읽고 바로 이해할 수 있어야 한다.",
    "- 사용자가 “그래서 지금 무엇을 보면 되고, 무엇을 해야 하는지”를 알 수 있어야 한다.",
    "- 실무적이고, 안전하고, 적용 가능해야 한다.",
    "- 필요한 경우에만 경고를 넣고, 필요한 경우에만 설명을 확장한다.",
    "- 현장 간호사에게 실제로 도움이 되는지 내부적으로 점검하고, 도움이 적은 일반론은 제거한다.",
    "- 답변은 “급할 때 바로 쓰는 카드”와 “짧게 공부되는 설명”의 중간지점이어야 한다.",
].join("\n");
function buildDeveloperPrompt(locale) {
    if (locale === "en") {
        return [
            exports.MED_SAFETY_LEGACY_DENSE_CORE_PROMPT_REFERENCE,
            "",
            "[LANGUAGE_OVERRIDE]",
            "- 위 규칙을 유지하되 최종 답변만 자연스러운 bedside clinical English로 작성한다.",
        ].join("\n");
    }
    return exports.MED_SAFETY_LEGACY_DENSE_CORE_PROMPT_REFERENCE;
}
function buildPromptDisciplineDiagnostics(decision, profile, assembly) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    var qualityLevel = (_a = profile === null || profile === void 0 ? void 0 : profile.qualityLevel) !== null && _a !== void 0 ? _a : "balanced";
    if (!decision) {
        return {
            qualityLevel: qualityLevel,
            confidenceDiscipline: "legacy_or_base_only",
            specificitySuppression: false,
            assumptionDisclosure: "not_applicable",
            basePromptChars: (_b = assembly === null || assembly === void 0 ? void 0 : assembly.basePromptChars) !== null && _b !== void 0 ? _b : null,
            finalPromptChars: (_c = assembly === null || assembly === void 0 ? void 0 : assembly.finalPromptChars) !== null && _c !== void 0 ? _c : null,
            selectedContractIds: (_d = assembly === null || assembly === void 0 ? void 0 : assembly.selectedContractIds) !== null && _d !== void 0 ? _d : [],
            droppedContractIds: (_e = assembly === null || assembly === void 0 ? void 0 : assembly.droppedContractIds) !== null && _e !== void 0 ? _e : [],
            openingMode: (_f = assembly === null || assembly === void 0 ? void 0 : assembly.blueprint.openingMode) !== null && _f !== void 0 ? _f : null,
            budgetClass: (_g = assembly === null || assembly === void 0 ? void 0 : assembly.budgetClass) !== null && _g !== void 0 ? _g : null,
        };
    }
    return {
        qualityLevel: qualityLevel,
        confidenceDiscipline: decision.risk === "high" && decision.entityClarity !== "high"
            ? "constrained_high_risk"
            : decision.entityClarity === "medium"
                ? "assumption_disclosed_general_only"
                : decision.entityClarity === "low"
                    ? "verification_before_specifics"
                    : decision.risk === "high"
                        ? "safety_first_verified_only"
                        : "standard",
        specificitySuppression: decision.risk === "high" || decision.entityClarity !== "high",
        assumptionDisclosure: decision.entityClarity === "medium"
            ? "opening_line_required"
            : decision.entityClarity === "low"
                ? "verification_required"
                : "not_required",
        basePromptChars: (_h = assembly === null || assembly === void 0 ? void 0 : assembly.basePromptChars) !== null && _h !== void 0 ? _h : null,
        finalPromptChars: (_j = assembly === null || assembly === void 0 ? void 0 : assembly.finalPromptChars) !== null && _j !== void 0 ? _j : null,
        selectedContractIds: (_k = assembly === null || assembly === void 0 ? void 0 : assembly.selectedContractIds) !== null && _k !== void 0 ? _k : [],
        droppedContractIds: (_l = assembly === null || assembly === void 0 ? void 0 : assembly.droppedContractIds) !== null && _l !== void 0 ? _l : [],
        openingMode: (_m = assembly === null || assembly === void 0 ? void 0 : assembly.blueprint.openingMode) !== null && _m !== void 0 ? _m : null,
        budgetClass: (_o = assembly === null || assembly === void 0 ? void 0 : assembly.budgetClass) !== null && _o !== void 0 ? _o : null,
    };
}
function buildUserPrompt(query, locale) {
    var normalizedQuery = normalizeText(query);
    if (locale === "en") {
        return [
            "User question: ".concat(normalizedQuery),
            "Answer directly in the format that best fits the user's intent, and if there is any risk, present safety and immediate actions first.",
        ].join("\n");
    }
    return [
        "\uC0AC\uC6A9\uC790 \uC9C8\uBB38: ".concat(normalizedQuery),
        "질문 의도에 가장 잘 맞는 형태로 직접 답하고, 위험 가능성이 있으면 안전과 행동을 먼저 제시하라.",
    ].join("\n");
}
function buildUserPromptWithContinuationMemory(userPrompt, memory, locale) {
    var normalizedMemory = normalizeText(memory !== null && memory !== void 0 ? memory : "");
    if (!normalizedMemory)
        return userPrompt;
    if (locale === "en") {
        return [
            userPrompt,
            "",
            "Prior conversation context:",
            normalizedMemory,
            "",
            "Use the prior context only when it is relevant to the current question. If the context is incomplete or conflicts with the current question, say that confirmation is needed instead of assuming.",
        ].join("\n");
    }
    return [
        userPrompt,
        "",
        "이전 대화 맥락:",
        normalizedMemory,
        "",
        "위 맥락은 현재 질문과 관련된 범위에서만 반영하라. 맥락이 불완전하거나 현재 질문과 충돌하면 단정하지 말고 확인이 필요하다고 밝혀라.",
    ].join("\n");
}
function extractResponsesText(json) {
    var _a, _b, _c, _d;
    var chunks = [];
    var seen = new Set();
    var append = function (raw) {
        if (typeof raw !== "string")
            return;
        var value = raw.replace(/\r/g, "").trim();
        if (!value)
            return;
        var key = value.toLowerCase();
        if (seen.has(key))
            return;
        seen.add(key);
        chunks.push(value);
    };
    var appendFromTextLike = function (value) {
        if (!value)
            return;
        if (typeof value === "string") {
            append(value);
            return;
        }
        if (Array.isArray(value)) {
            for (var _i = 0, value_1 = value; _i < value_1.length; _i++) {
                var item = value_1[_i];
                appendFromTextLike(item);
            }
            return;
        }
        if (typeof value !== "object")
            return;
        var node = value;
        append(node.value);
        append(node.text);
        if (typeof node.text === "object" && node.text) {
            append(node.text.value);
        }
        append(node.output_text);
        append(node.transcript);
    };
    appendFromTextLike((_c = (_b = (_a = json === null || json === void 0 ? void 0 : json.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content);
    appendFromTextLike(json === null || json === void 0 ? void 0 : json.output_text);
    var output = Array.isArray(json === null || json === void 0 ? void 0 : json.output) ? json.output : [];
    for (var _i = 0, output_1 = output; _i < output_1.length; _i++) {
        var item = output_1[_i];
        appendFromTextLike(item === null || item === void 0 ? void 0 : item.output_text);
        appendFromTextLike(item === null || item === void 0 ? void 0 : item.text);
        appendFromTextLike(item === null || item === void 0 ? void 0 : item.transcript);
        var content = Array.isArray(item === null || item === void 0 ? void 0 : item.content) ? item.content : [];
        for (var _e = 0, content_1 = content; _e < content_1.length; _e++) {
            var part = content_1[_e];
            appendFromTextLike(part === null || part === void 0 ? void 0 : part.output_text);
            appendFromTextLike(part === null || part === void 0 ? void 0 : part.text);
            appendFromTextLike(part === null || part === void 0 ? void 0 : part.transcript);
            appendFromTextLike(part);
        }
    }
    var messageContent = Array.isArray((_d = json === null || json === void 0 ? void 0 : json.message) === null || _d === void 0 ? void 0 : _d.content) ? json.message.content : [];
    for (var _f = 0, messageContent_1 = messageContent; _f < messageContent_1.length; _f++) {
        var part = messageContent_1[_f];
        appendFromTextLike(part === null || part === void 0 ? void 0 : part.text);
        appendFromTextLike(part === null || part === void 0 ? void 0 : part.output_text);
        appendFromTextLike(part === null || part === void 0 ? void 0 : part.transcript);
        appendFromTextLike(part);
    }
    return chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function extractConversationId(json) {
    var _a;
    var conversationFromString = typeof (json === null || json === void 0 ? void 0 : json.conversation) === "string" ? json.conversation : "";
    var conversationFromObject = typeof ((_a = json === null || json === void 0 ? void 0 : json.conversation) === null || _a === void 0 ? void 0 : _a.id) === "string" ? json.conversation.id : "";
    return conversationFromString || conversationFromObject || null;
}
function readStringFromUnknown(value) {
    if (typeof value === "string")
        return value;
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    return "";
}
function readNumberFromUnknown(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        var parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function normalizeUsageNode(value) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    if (!value || typeof value !== "object")
        return null;
    var node = value;
    var inputTokens = readNumberFromUnknown((_b = (_a = node.input_tokens) !== null && _a !== void 0 ? _a : node.prompt_tokens) !== null && _b !== void 0 ? _b : node.inputTokens);
    var outputTokens = readNumberFromUnknown((_d = (_c = node.output_tokens) !== null && _c !== void 0 ? _c : node.completion_tokens) !== null && _d !== void 0 ? _d : node.outputTokens);
    var inputDetails = (_f = (_e = node.input_tokens_details) !== null && _e !== void 0 ? _e : node.prompt_tokens_details) !== null && _f !== void 0 ? _f : node.inputTokensDetails;
    var outputDetails = (_h = (_g = node.output_tokens_details) !== null && _g !== void 0 ? _g : node.completion_tokens_details) !== null && _h !== void 0 ? _h : node.outputTokensDetails;
    var cachedInputTokens = readNumberFromUnknown((_j = inputDetails === null || inputDetails === void 0 ? void 0 : inputDetails.cached_tokens) !== null && _j !== void 0 ? _j : inputDetails === null || inputDetails === void 0 ? void 0 : inputDetails.cachedTokens);
    var reasoningTokens = readNumberFromUnknown((_k = outputDetails === null || outputDetails === void 0 ? void 0 : outputDetails.reasoning_tokens) !== null && _k !== void 0 ? _k : outputDetails === null || outputDetails === void 0 ? void 0 : outputDetails.reasoningTokens);
    var totalTokens = (_m = readNumberFromUnknown((_l = node.total_tokens) !== null && _l !== void 0 ? _l : node.totalTokens)) !== null && _m !== void 0 ? _m : (inputTokens != null || outputTokens != null ? (inputTokens !== null && inputTokens !== void 0 ? inputTokens : 0) + (outputTokens !== null && outputTokens !== void 0 ? outputTokens : 0) : null);
    if (inputTokens == null && outputTokens == null && totalTokens == null && cachedInputTokens == null && reasoningTokens == null)
        return null;
    return {
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        totalTokens: totalTokens,
        cachedInputTokens: cachedInputTokens,
        reasoningTokens: reasoningTokens,
    };
}
function extractResponsesUsage(json) {
    var _a, _b, _c, _d, _e;
    return ((_e = (_c = (_a = normalizeUsageNode(json === null || json === void 0 ? void 0 : json.usage)) !== null && _a !== void 0 ? _a : normalizeUsageNode((_b = json === null || json === void 0 ? void 0 : json.response) === null || _b === void 0 ? void 0 : _b.usage)) !== null && _c !== void 0 ? _c : normalizeUsageNode((_d = json === null || json === void 0 ? void 0 : json.metrics) === null || _d === void 0 ? void 0 : _d.usage)) !== null && _e !== void 0 ? _e : null);
}
function sumUsages() {
    var values = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        values[_i] = arguments[_i];
    }
    var normalized = values.filter(function (value) { return Boolean(value); });
    if (!normalized.length)
        return null;
    var sum = function (items) {
        var usable = items.filter(function (item) { return typeof item === "number" && Number.isFinite(item); });
        if (!usable.length)
            return null;
        return usable.reduce(function (total, item) { return total + item; }, 0);
    };
    return {
        inputTokens: sum(normalized.map(function (item) { return item.inputTokens; })),
        outputTokens: sum(normalized.map(function (item) { return item.outputTokens; })),
        totalTokens: sum(normalized.map(function (item) { return item.totalTokens; })),
        cachedInputTokens: sum(normalized.map(function (item) { return item.cachedInputTokens; })),
        reasoningTokens: sum(normalized.map(function (item) { return item.reasoningTokens; })),
    };
}
function serializeRouteDecision(decision) {
    if (!decision)
        return null;
    return {
        intent: decision.intent,
        risk: decision.risk,
        entityClarity: decision.entityClarity,
        answerDepth: decision.answerDepth,
        needsEscalation: decision.needsEscalation,
        needsSbar: decision.needsSbar,
        format: decision.format,
        source: decision.source,
        confidence: decision.confidence,
    };
}
function countVisibleAnswerLines(answer) {
    return normalizeText(answer)
        .split("\n")
        .map(function (line) { return line.trim(); })
        .filter(Boolean).length;
}
function parseIssueCodes(raw) {
    return String(raw !== null && raw !== void 0 ? raw : "")
        .split(",")
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
}
function mergeQualityDecisions(heuristic, model) {
    if (!model)
        return heuristic;
    var priority = function (verdict) {
        return verdict === "repair_required" ? 2 : verdict === "pass_but_verbose" ? 1 : 0;
    };
    var chosen = priority(model.verdict) >= priority(heuristic.verdict) ? model.verdict : heuristic.verdict;
    var mergedIssues = Array.from(new Set(__spreadArray(__spreadArray([], parseIssueCodes(heuristic.repairInstructions), true), parseIssueCodes(model.repairInstructions), true)));
    return {
        verdict: chosen,
        repairInstructions: mergedIssues.join(","),
    };
}
function buildUsageBreakdown(args) {
    var _a, _b, _c, _d, _e, _f, _g;
    return {
        router: (_a = args.routerUsage) !== null && _a !== void 0 ? _a : null,
        main: (_b = args.mainUsage) !== null && _b !== void 0 ? _b : null,
        gate: (_c = args.gateUsage) !== null && _c !== void 0 ? _c : null,
        repair: (_d = args.repairUsage) !== null && _d !== void 0 ? _d : null,
        translation: (_e = args.translationUsage) !== null && _e !== void 0 ? _e : null,
        total: sumUsages(args.routerUsage, args.mainUsage, args.gateUsage, args.repairUsage, args.translationUsage),
        visibleAnswerChars: normalizeText(args.answer).length,
        visibleAnswerLines: countVisibleAnswerLines(args.answer),
        assembledPromptChars: (_f = args.assembledPromptChars) !== null && _f !== void 0 ? _f : null,
        selectedContracts: (_g = args.selectedContracts) !== null && _g !== void 0 ? _g : [],
        runtimeMode: args.runtimeMode,
        routeDecision: serializeRouteDecision(args.routeDecision),
    };
}
function extractResponsesDelta(event) {
    var _a, _b, _c, _d;
    var eventType = String((_a = event === null || event === void 0 ? void 0 : event.type) !== null && _a !== void 0 ? _a : "");
    if (!eventType || !eventType.includes("delta"))
        return "";
    if (eventType.includes("reasoning"))
        return "";
    var direct = readStringFromUnknown(event === null || event === void 0 ? void 0 : event.delta);
    if (direct)
        return direct;
    var outputTextDelta = readStringFromUnknown((_b = event === null || event === void 0 ? void 0 : event.output_text) === null || _b === void 0 ? void 0 : _b.delta);
    if (outputTextDelta)
        return outputTextDelta;
    var textDelta = readStringFromUnknown((_c = event === null || event === void 0 ? void 0 : event.text) === null || _c === void 0 ? void 0 : _c.delta);
    if (textDelta)
        return textDelta;
    var partText = readStringFromUnknown((_d = event === null || event === void 0 ? void 0 : event.part) === null || _d === void 0 ? void 0 : _d.text);
    if (partText)
        return partText;
    return "";
}
function readResponsesEventStream(args) {
    return __awaiter(this, void 0, void 0, function () {
        var response, model, onTextDelta, contentType, fallbackJson, fallbackText_1, fallbackResponseId, fallbackConversationId, fallbackJson, fallbackText_2, fallbackResponseId, fallbackConversationId, reader, decoder, buffer, rawText, responseId, conversationId, completedResponse, lastEventPayload, streamError, usage, trackMeta, handleSseBlock, _a, done, value, separatorIndex, block, separatorIndex, block, cause_1, fallbackNode, fallbackText, finalText;
        var _this = this;
        var _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    response = args.response, model = args.model, onTextDelta = args.onTextDelta;
                    contentType = String((_b = response.headers.get("content-type")) !== null && _b !== void 0 ? _b : "").toLowerCase();
                    if (!!contentType.includes("text/event-stream")) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.json().catch(function () { return null; })];
                case 1:
                    fallbackJson = _g.sent();
                    fallbackText_1 = extractResponsesText(fallbackJson);
                    fallbackResponseId = typeof (fallbackJson === null || fallbackJson === void 0 ? void 0 : fallbackJson.id) === "string" ? fallbackJson.id : null;
                    fallbackConversationId = extractConversationId(fallbackJson);
                    if (!fallbackText_1) {
                        return [2 /*return*/, {
                                text: null,
                                error: "openai_empty_text_model:".concat(model),
                                responseId: fallbackResponseId,
                                conversationId: fallbackConversationId,
                                usage: extractResponsesUsage(fallbackJson),
                            }];
                    }
                    return [4 /*yield*/, onTextDelta(fallbackText_1)];
                case 2:
                    _g.sent();
                    return [2 /*return*/, {
                            text: fallbackText_1,
                            error: null,
                            responseId: fallbackResponseId,
                            conversationId: fallbackConversationId,
                            usage: extractResponsesUsage(fallbackJson),
                        }];
                case 3:
                    if (!!response.body) return [3 /*break*/, 6];
                    return [4 /*yield*/, response.json().catch(function () { return null; })];
                case 4:
                    fallbackJson = _g.sent();
                    fallbackText_2 = extractResponsesText(fallbackJson);
                    fallbackResponseId = typeof (fallbackJson === null || fallbackJson === void 0 ? void 0 : fallbackJson.id) === "string" ? fallbackJson.id : null;
                    fallbackConversationId = extractConversationId(fallbackJson);
                    if (!fallbackText_2) {
                        return [2 /*return*/, {
                                text: null,
                                error: "openai_empty_text_model:".concat(model),
                                responseId: fallbackResponseId,
                                conversationId: fallbackConversationId,
                                usage: extractResponsesUsage(fallbackJson),
                            }];
                    }
                    return [4 /*yield*/, onTextDelta(fallbackText_2)];
                case 5:
                    _g.sent();
                    return [2 /*return*/, {
                            text: fallbackText_2,
                            error: null,
                            responseId: fallbackResponseId,
                            conversationId: fallbackConversationId,
                            usage: extractResponsesUsage(fallbackJson),
                        }];
                case 6:
                    reader = response.body.getReader();
                    decoder = new TextDecoder();
                    buffer = "";
                    rawText = "";
                    responseId = null;
                    conversationId = null;
                    completedResponse = null;
                    lastEventPayload = null;
                    streamError = null;
                    usage = null;
                    trackMeta = function (node) {
                        if (!node || typeof node !== "object")
                            return;
                        if (!responseId && typeof node.id === "string")
                            responseId = node.id;
                        if (!conversationId)
                            conversationId = extractConversationId(node);
                    };
                    handleSseBlock = function (block) { return __awaiter(_this, void 0, void 0, function () {
                        var dataLines, dataText, event, eventType, errorMessage, delta;
                        var _a, _b, _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    if (!block.trim())
                                        return [2 /*return*/];
                                    dataLines = block
                                        .split(/\r?\n/g)
                                        .map(function (line) { return line.trimEnd(); })
                                        .filter(function (line) { return line.startsWith("data:"); })
                                        .map(function (line) { return line.slice(5).trimStart(); });
                                    if (!dataLines.length)
                                        return [2 /*return*/];
                                    dataText = dataLines.join("\n").trim();
                                    if (!dataText || dataText === "[DONE]")
                                        return [2 /*return*/];
                                    event = null;
                                    try {
                                        event = JSON.parse(dataText);
                                    }
                                    catch (_f) {
                                        return [2 /*return*/];
                                    }
                                    lastEventPayload = event;
                                    trackMeta(event);
                                    if ((event === null || event === void 0 ? void 0 : event.response) && typeof event.response === "object") {
                                        trackMeta(event.response);
                                        usage = (_a = extractResponsesUsage(event.response)) !== null && _a !== void 0 ? _a : usage;
                                    }
                                    eventType = String((_b = event === null || event === void 0 ? void 0 : event.type) !== null && _b !== void 0 ? _b : "");
                                    if (eventType === "response.completed" && (event === null || event === void 0 ? void 0 : event.response) && typeof event.response === "object") {
                                        completedResponse = event.response;
                                        usage = (_c = extractResponsesUsage(event.response)) !== null && _c !== void 0 ? _c : usage;
                                    }
                                    if (eventType === "error") {
                                        errorMessage = readStringFromUnknown((_d = event === null || event === void 0 ? void 0 : event.error) === null || _d === void 0 ? void 0 : _d.message) ||
                                            readStringFromUnknown(event === null || event === void 0 ? void 0 : event.message) ||
                                            "stream_error";
                                        streamError = "openai_stream_error_model:".concat(model, "_").concat(truncateError(errorMessage));
                                        return [2 /*return*/];
                                    }
                                    delta = extractResponsesDelta(event);
                                    if (!delta)
                                        return [2 /*return*/];
                                    rawText += delta;
                                    return [4 /*yield*/, onTextDelta(delta)];
                                case 1:
                                    _e.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    _g.label = 7;
                case 7:
                    _g.trys.push([7, 19, , 20]);
                    _g.label = 8;
                case 8:
                    if (!true) return [3 /*break*/, 13];
                    return [4 /*yield*/, reader.read()];
                case 9:
                    _a = _g.sent(), done = _a.done, value = _a.value;
                    if (done)
                        return [3 /*break*/, 13];
                    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
                    _g.label = 10;
                case 10:
                    if (!true) return [3 /*break*/, 12];
                    separatorIndex = buffer.indexOf("\n\n");
                    if (separatorIndex < 0)
                        return [3 /*break*/, 12];
                    block = buffer.slice(0, separatorIndex);
                    buffer = buffer.slice(separatorIndex + 2);
                    return [4 /*yield*/, handleSseBlock(block)];
                case 11:
                    _g.sent();
                    return [3 /*break*/, 10];
                case 12: return [3 /*break*/, 8];
                case 13:
                    buffer += decoder.decode().replace(/\r\n/g, "\n");
                    _g.label = 14;
                case 14:
                    if (!true) return [3 /*break*/, 16];
                    separatorIndex = buffer.indexOf("\n\n");
                    if (separatorIndex < 0)
                        return [3 /*break*/, 16];
                    block = buffer.slice(0, separatorIndex);
                    buffer = buffer.slice(separatorIndex + 2);
                    return [4 /*yield*/, handleSseBlock(block)];
                case 15:
                    _g.sent();
                    return [3 /*break*/, 14];
                case 16:
                    if (!buffer.trim()) return [3 /*break*/, 18];
                    return [4 /*yield*/, handleSseBlock(buffer)];
                case 17:
                    _g.sent();
                    _g.label = 18;
                case 18: return [3 /*break*/, 20];
                case 19:
                    cause_1 = _g.sent();
                    return [2 /*return*/, {
                            text: null,
                            error: "openai_stream_parse_failed_model:".concat(model, "_").concat(truncateError(String((_d = (_c = cause_1 === null || cause_1 === void 0 ? void 0 : cause_1.message) !== null && _c !== void 0 ? _c : cause_1) !== null && _d !== void 0 ? _d : "unknown_error"))),
                            responseId: responseId,
                            conversationId: conversationId,
                            usage: usage,
                        }];
                case 20:
                    if (streamError) {
                        return [2 /*return*/, {
                                text: null,
                                error: streamError,
                                responseId: responseId,
                                conversationId: conversationId,
                                usage: usage,
                            }];
                    }
                    fallbackNode = (_f = (_e = completedResponse !== null && completedResponse !== void 0 ? completedResponse : lastEventPayload === null || lastEventPayload === void 0 ? void 0 : lastEventPayload.response) !== null && _e !== void 0 ? _e : lastEventPayload) !== null && _f !== void 0 ? _f : null;
                    fallbackText = fallbackNode ? extractResponsesText(fallbackNode) : "";
                    finalText = fallbackText.trim().length >= rawText.trim().length ? fallbackText.trim() : rawText.trim();
                    if (!finalText) {
                        return [2 /*return*/, {
                                text: null,
                                error: "openai_empty_text_model:".concat(model),
                                responseId: responseId,
                                conversationId: conversationId,
                                usage: usage !== null && usage !== void 0 ? usage : extractResponsesUsage(fallbackNode),
                            }];
                    }
                    return [2 /*return*/, {
                            text: finalText,
                            error: null,
                            responseId: responseId,
                            conversationId: conversationId,
                            usage: usage !== null && usage !== void 0 ? usage : extractResponsesUsage(fallbackNode),
                        }];
            }
        });
    });
}
function isRetryableOpenAIError(error) {
    var e = String(error !== null && error !== void 0 ? error : "").toLowerCase();
    if (!e)
        return false;
    if (e.startsWith("openai_network_"))
        return true;
    if (e.includes("openai_empty_text_"))
        return true;
    if (/openai_responses_(408|409|425|429|500|502|503|504)/.test(e))
        return true;
    if (/openai_responses_403/.test(e) && /(html|forbidden|proxy|firewall|blocked|access denied|cloudflare)/.test(e))
        return true;
    return false;
}
function isReasoningEffortRejected(error) {
    var e = String(error !== null && error !== void 0 ? error : "").toLowerCase();
    if (!isBadRequestError(e))
        return false;
    return /(reasoning|effort|unsupported value|unsupported parameter|invalid.*reasoning)/i.test(e);
}
function logHybridDiagnostics(args) {
    var _a, _b;
    if (args.runtimeMode === "legacy")
        return;
    try {
        console.info("[MedSafetyHybrid] %s", JSON.stringify(__assign({ runtimeMode: args.runtimeMode, stage: args.stage, model: args.model, routeDecision: args.routeDecision
                ? {
                    intent: args.routeDecision.intent,
                    risk: args.routeDecision.risk,
                    entityClarity: args.routeDecision.entityClarity,
                    answerDepth: args.routeDecision.answerDepth,
                    needsEscalation: args.routeDecision.needsEscalation,
                    needsSbar: args.routeDecision.needsSbar,
                    format: args.routeDecision.format,
                    source: args.routeDecision.source,
                    confidence: args.routeDecision.confidence,
                }
                : null, usage: (_a = args.usage) !== null && _a !== void 0 ? _a : null, promptChars: typeof args.promptChars === "number" ? args.promptChars : null }, ((_b = args.extra) !== null && _b !== void 0 ? _b : {}))));
    }
    catch (_c) {
        // ignore logging failures
    }
}
function sleepWithAbort(ms, signal) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (ms <= 0)
                        return [2 /*return*/];
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var timer = setTimeout(function () {
                                signal.removeEventListener("abort", onAbort);
                                resolve();
                            }, ms);
                            var onAbort = function () {
                                clearTimeout(timer);
                                signal.removeEventListener("abort", onAbort);
                                reject(new Error("aborted"));
                            };
                            if (signal.aborted) {
                                onAbort();
                                return;
                            }
                            signal.addEventListener("abort", onAbort);
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function callResponsesApi(args) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, model, developerPrompt, userPrompt, apiBaseUrl, imageDataUrl, previousResponseId, conversationId, signal, maxOutputTokens, upstreamTimeoutMs, verbosity, reasoningEffort, storeResponses, compatMode, onTextDelta, requestConfig, userContent, baseInput, body, response, timedOut, requestAbort, onParentAbort, timeout, cause_2, raw, json, text, responseId, conversationResponseId;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    apiKey = args.apiKey, model = args.model, developerPrompt = args.developerPrompt, userPrompt = args.userPrompt, apiBaseUrl = args.apiBaseUrl, imageDataUrl = args.imageDataUrl, previousResponseId = args.previousResponseId, conversationId = args.conversationId, signal = args.signal, maxOutputTokens = args.maxOutputTokens, upstreamTimeoutMs = args.upstreamTimeoutMs, verbosity = args.verbosity, reasoningEffort = args.reasoningEffort, storeResponses = args.storeResponses, compatMode = args.compatMode, onTextDelta = args.onTextDelta;
                    requestConfig = (0, openaiGateway_1.resolveOpenAIResponsesRequestConfig)({
                        apiBaseUrl: apiBaseUrl,
                        apiKey: apiKey,
                        model: model,
                        scope: "med_safety",
                    });
                    if (requestConfig.missingCredential) {
                        return [2 /*return*/, {
                                text: null,
                                error: requestConfig.missingCredential,
                                responseId: null,
                                conversationId: null,
                                usage: null,
                            }];
                    }
                    userContent = [{ type: "input_text", text: userPrompt }];
                    if (imageDataUrl) {
                        userContent.push({
                            type: "input_image",
                            image_url: imageDataUrl,
                        });
                    }
                    baseInput = [
                        {
                            role: "developer",
                            content: [{ type: "input_text", text: developerPrompt }],
                        },
                        {
                            role: "user",
                            content: userContent,
                        },
                    ];
                    body = compatMode
                        ? {
                            model: requestConfig.model,
                            input: baseInput,
                            max_output_tokens: maxOutputTokens,
                        }
                        : {
                            model: requestConfig.model,
                            input: baseInput,
                            text: {
                                format: { type: "text" },
                                verbosity: verbosity,
                            },
                            reasoning: { effort: reasoningEffort },
                            max_output_tokens: maxOutputTokens,
                            tools: [],
                            store: storeResponses,
                        };
                    if (onTextDelta && !compatMode)
                        body.stream = true;
                    if (previousResponseId)
                        body.previous_response_id = previousResponseId;
                    else if (conversationId)
                        body.conversation = conversationId;
                    timedOut = false;
                    requestAbort = new AbortController();
                    onParentAbort = function () { return requestAbort.abort(); };
                    if (signal.aborted) {
                        onParentAbort();
                    }
                    else {
                        signal.addEventListener("abort", onParentAbort);
                    }
                    timeout = setTimeout(function () {
                        timedOut = true;
                        requestAbort.abort();
                    }, upstreamTimeoutMs);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetch(requestConfig.requestUrl, {
                            method: "POST",
                            headers: requestConfig.headers,
                            body: JSON.stringify(body),
                            signal: requestAbort.signal,
                        })];
                case 2:
                    response = _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    cause_2 = _c.sent();
                    clearTimeout(timeout);
                    signal.removeEventListener("abort", onParentAbort);
                    if (timedOut) {
                        return [2 /*return*/, {
                                text: null,
                                error: "openai_timeout_upstream_model:".concat(requestConfig.model),
                                responseId: null,
                                conversationId: null,
                                usage: null,
                            }];
                    }
                    return [2 /*return*/, {
                            text: null,
                            error: "openai_network_".concat(truncateError(String((_b = (_a = cause_2 === null || cause_2 === void 0 ? void 0 : cause_2.message) !== null && _a !== void 0 ? _a : cause_2) !== null && _b !== void 0 ? _b : "fetch_failed"))),
                            responseId: null,
                            conversationId: null,
                            usage: null,
                        }];
                case 4:
                    clearTimeout(timeout);
                    signal.removeEventListener("abort", onParentAbort);
                    if (!!response.ok) return [3 /*break*/, 6];
                    return [4 /*yield*/, response.text().catch(function () { return ""; })];
                case 5:
                    raw = _c.sent();
                    return [2 /*return*/, {
                            text: null,
                            error: "openai_responses_".concat(response.status, "_model:").concat(requestConfig.model, "_").concat(truncateError(raw || "unknown_error")),
                            responseId: null,
                            conversationId: null,
                            usage: null,
                        }];
                case 6:
                    if (onTextDelta) {
                        return [2 /*return*/, readResponsesEventStream({
                                response: response,
                                model: requestConfig.model,
                                onTextDelta: onTextDelta,
                            })];
                    }
                    return [4 /*yield*/, response.json().catch(function () { return null; })];
                case 7:
                    json = _c.sent();
                    text = extractResponsesText(json);
                    responseId = typeof (json === null || json === void 0 ? void 0 : json.id) === "string" ? json.id : null;
                    conversationResponseId = extractConversationId(json);
                    if (!text) {
                        return [2 /*return*/, {
                                text: null,
                                error: "openai_empty_text_model:".concat(requestConfig.model),
                                responseId: responseId,
                                conversationId: conversationResponseId,
                                usage: extractResponsesUsage(json),
                            }];
                    }
                    return [2 /*return*/, { text: text, error: null, responseId: responseId, conversationId: conversationResponseId, usage: extractResponsesUsage(json) }];
            }
        });
    });
}
function callResponsesApiWithRetry(args) {
    return __awaiter(this, void 0, void 0, function () {
        var retries, retryBaseMs, rest, attempt, last, backoff, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    retries = args.retries, retryBaseMs = args.retryBaseMs, rest = __rest(args, ["retries", "retryBaseMs"]);
                    attempt = 0;
                    last = { text: null, error: "openai_request_failed", responseId: null, conversationId: null, usage: null };
                    _b.label = 1;
                case 1:
                    if (!(attempt <= retries)) return [3 /*break*/, 7];
                    return [4 /*yield*/, callResponsesApi(rest)];
                case 2:
                    last = _b.sent();
                    if (!last.error)
                        return [2 /*return*/, last];
                    if (!isRetryableOpenAIError(last.error) || attempt >= retries)
                        return [2 /*return*/, last];
                    backoff = Math.min(5000, retryBaseMs * (attempt + 1)) + Math.floor(Math.random() * 250);
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, sleepWithAbort(backoff, rest.signal)];
                case 4:
                    _b.sent();
                    return [3 /*break*/, 6];
                case 5:
                    _a = _b.sent();
                    return [2 /*return*/, {
                            text: null,
                            error: "openai_timeout_retry_aborted",
                            responseId: null,
                            conversationId: null,
                            usage: null,
                        }];
                case 6:
                    attempt += 1;
                    return [3 /*break*/, 1];
                case 7: return [2 /*return*/, last];
            }
        });
    });
}
function generateAnswerWithPrompt(args) {
    return __awaiter(this, void 0, void 0, function () {
        var reasoningEfforts, outputTokenCandidates, reasoningIndex, reasoningEffort, tokenIndex, outputTokenLimit, allowStreamDelta, attempt, statelessRetry;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    reasoningEfforts = args.profile.reasoningEfforts;
                    outputTokenCandidates = args.profile.outputTokenCandidates;
                    reasoningIndex = 0;
                    _f.label = 1;
                case 1:
                    if (!(reasoningIndex < reasoningEfforts.length)) return [3 /*break*/, 8];
                    reasoningEffort = reasoningEfforts[reasoningIndex];
                    tokenIndex = 0;
                    _f.label = 2;
                case 2:
                    if (!(tokenIndex < outputTokenCandidates.length)) return [3 /*break*/, 7];
                    outputTokenLimit = outputTokenCandidates[tokenIndex];
                    allowStreamDelta = Boolean(args.allowStreaming) && Boolean(args.onTextDelta) && reasoningIndex === 0 && tokenIndex === 0;
                    return [4 /*yield*/, callResponsesApiWithRetry({
                            apiKey: args.apiKey,
                            model: args.model,
                            developerPrompt: args.developerPrompt,
                            userPrompt: args.userPrompt,
                            apiBaseUrl: args.apiBaseUrl,
                            imageDataUrl: args.imageDataUrl,
                            previousResponseId: args.previousResponseId,
                            conversationId: args.conversationId,
                            signal: args.signal,
                            maxOutputTokens: outputTokenLimit,
                            upstreamTimeoutMs: args.upstreamTimeoutMs,
                            verbosity: args.profile.verbosity,
                            reasoningEffort: reasoningEffort,
                            storeResponses: args.storeResponses,
                            onTextDelta: allowStreamDelta ? args.onTextDelta : undefined,
                            retries: allowStreamDelta ? 0 : args.networkRetries,
                            retryBaseMs: args.networkRetryBaseMs,
                        })];
                case 3:
                    attempt = _f.sent();
                    if (!attempt.error && attempt.text) {
                        return [2 /*return*/, {
                                answerText: attempt.text,
                                responseId: attempt.responseId,
                                conversationId: attempt.conversationId,
                                usage: attempt.usage,
                                stage: "main",
                                streamed: allowStreamDelta,
                                reasoningEffort: reasoningEffort,
                                maxOutputTokens: outputTokenLimit,
                                error: null,
                            }];
                    }
                    if (!attempt.error) return [3 /*break*/, 6];
                    if (isReasoningEffortRejected(attempt.error)) {
                        if (reasoningIndex + 1 < reasoningEfforts.length)
                            return [3 /*break*/, 7];
                        return [2 /*return*/, {
                                answerText: null,
                                responseId: attempt.responseId,
                                conversationId: attempt.conversationId,
                                usage: attempt.usage,
                                stage: "main",
                                streamed: false,
                                reasoningEffort: reasoningEffort,
                                maxOutputTokens: outputTokenLimit,
                                error: attempt.error,
                            }];
                    }
                    if (!(isBadRequestError(attempt.error) && tokenIndex === 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, callResponsesApi({
                            apiKey: args.apiKey,
                            model: args.model,
                            developerPrompt: args.developerPrompt,
                            userPrompt: args.userPrompt,
                            apiBaseUrl: args.apiBaseUrl,
                            imageDataUrl: args.imageDataUrl,
                            signal: args.signal,
                            maxOutputTokens: outputTokenLimit,
                            upstreamTimeoutMs: args.upstreamTimeoutMs,
                            verbosity: args.profile.verbosity,
                            reasoningEffort: reasoningEffort,
                            storeResponses: args.storeResponses,
                            compatMode: true,
                        })];
                case 4:
                    statelessRetry = _f.sent();
                    if (!statelessRetry.error && statelessRetry.text) {
                        return [2 /*return*/, {
                                answerText: statelessRetry.text,
                                responseId: statelessRetry.responseId,
                                conversationId: statelessRetry.conversationId,
                                usage: statelessRetry.usage,
                                stage: "main_compat",
                                streamed: false,
                                reasoningEffort: reasoningEffort,
                                maxOutputTokens: outputTokenLimit,
                                error: null,
                            }];
                    }
                    if (isTokenLimitError((_a = statelessRetry.error) !== null && _a !== void 0 ? _a : ""))
                        return [3 /*break*/, 6];
                    if (isReasoningEffortRejected((_b = statelessRetry.error) !== null && _b !== void 0 ? _b : "") && reasoningIndex + 1 < reasoningEfforts.length) {
                        return [3 /*break*/, 7];
                    }
                    return [2 /*return*/, {
                            answerText: null,
                            responseId: statelessRetry.responseId,
                            conversationId: statelessRetry.conversationId,
                            usage: sumUsages(attempt.usage, statelessRetry.usage),
                            stage: "main_compat",
                            streamed: false,
                            reasoningEffort: reasoningEffort,
                            maxOutputTokens: outputTokenLimit,
                            error: (_c = statelessRetry.error) !== null && _c !== void 0 ? _c : attempt.error,
                        }];
                case 5:
                    if (isTokenLimitError(attempt.error))
                        return [3 /*break*/, 6];
                    return [2 /*return*/, {
                            answerText: null,
                            responseId: attempt.responseId,
                            conversationId: attempt.conversationId,
                            usage: attempt.usage,
                            stage: "main",
                            streamed: false,
                            reasoningEffort: reasoningEffort,
                            maxOutputTokens: outputTokenLimit,
                            error: attempt.error,
                        }];
                case 6:
                    tokenIndex += 1;
                    return [3 /*break*/, 2];
                case 7:
                    reasoningIndex += 1;
                    return [3 /*break*/, 1];
                case 8: return [2 /*return*/, {
                        answerText: null,
                        responseId: null,
                        conversationId: null,
                        usage: null,
                        stage: "main",
                        streamed: false,
                        reasoningEffort: (_d = args.profile.reasoningEfforts[0]) !== null && _d !== void 0 ? _d : "medium",
                        maxOutputTokens: (_e = args.profile.outputTokenCandidates[0]) !== null && _e !== void 0 ? _e : 1200,
                        error: "openai_empty_text",
                    }];
            }
        });
    });
}
function buildFallbackAnswer(query, locale, note) {
    var safeQuery = normalizeText(query) || (locale === "en" ? "your question" : "질문 내용");
    var issue = locale === "en" ? describeFallbackIssueEn(note) : describeFallbackIssueKo(note);
    if (locale === "en") {
        return [
            "A full AI answer could not be completed, so a conservative safety fallback is shown.",
            "- Status: ".concat(issue),
            "- Question: ".concat(safeQuery),
            "- If there is immediate risk, stop the action and follow local escalation protocol right away.",
            "- If the issue depends on a medication name, device name, dosage, rate, or setting, verify the exact target and ask again.",
            "- The final authority is local protocol, clinician order, pharmacy review, and manufacturer IFU.",
        ].join("\n");
    }
    return [
        "AI 응답이 끝까지 완료되지 않아 보수적인 안전 안내만 표시합니다.",
        "- \uC0C1\uD0DC: ".concat(issue),
        "- \uC9C8\uBB38: ".concat(safeQuery),
        "- 즉시 위험 가능성이 있으면 처치를 멈추고 기관 프로토콜에 따라 바로 보고/호출해 주세요.",
        "- 약물명, 기구명, 용량, 속도, 세팅값처럼 대상 확인이 필요한 경우 정확한 명칭을 확인한 뒤 다시 질문해 주세요.",
        "- 최종 기준은 기관 프로토콜, 의사 지시, 약제부 확인, 제조사 IFU입니다.",
    ].join("\n");
}
function describeFallbackIssueKo(note) {
    var normalized = String(note !== null && note !== void 0 ? note : "").toLowerCase();
    if (!normalized)
        return "일시적인 처리 문제로 전체 답변을 완료하지 못했습니다.";
    if (normalized.includes("missing_openai_api_key"))
        return "AI 연결 설정을 확인해야 합니다.";
    if (normalized.includes("openai_timeout_total_budget") || normalized.includes("translate_timeout_total_budget")) {
        return "응답 시간이 길어 처리 제한 시간을 넘었습니다.";
    }
    if (normalized.includes("openai_timeout_upstream"))
        return "AI 서버 응답이 지연되었습니다.";
    if (normalized.includes("openai_timeout_retry_aborted"))
        return "재시도 중 요청이 중단되었습니다.";
    if (normalized.startsWith("openai_network_"))
        return "네트워크 또는 업스트림 연결 문제가 있었습니다.";
    if (normalized.includes("openai_stream_parse_failed"))
        return "AI 응답 스트림을 끝까지 읽지 못했습니다.";
    if (normalized.includes("openai_empty_text"))
        return "AI 응답 본문이 비어 있었습니다.";
    if (normalized.includes("openai_responses_429"))
        return "AI 요청 한도가 초과되었습니다.";
    if (normalized.includes("openai_responses_401"))
        return "AI 계정 인증 상태를 확인해야 합니다.";
    if (normalized.includes("openai_responses_403"))
        return "AI 모델 접근 권한 또는 연결 상태를 확인해야 합니다.";
    if (normalized.includes("openai_responses_404"))
        return "요청한 AI 모델 또는 경로를 찾지 못했습니다.";
    if (/openai_responses_(500|502|503|504)/.test(normalized))
        return "AI 서버에 일시적인 장애가 있었습니다.";
    if (normalized.includes("openai_responses_400"))
        return "요청 형식 또는 대화 상태 문제로 답변이 중단되었습니다.";
    return "일시적인 처리 문제로 전체 답변을 완료하지 못했습니다.";
}
function describeFallbackIssueEn(note) {
    var normalized = String(note !== null && note !== void 0 ? note : "").toLowerCase();
    if (!normalized)
        return "A temporary processing issue prevented the full answer.";
    if (normalized.includes("missing_openai_api_key"))
        return "The AI connection configuration needs to be checked.";
    if (normalized.includes("openai_timeout_total_budget") || normalized.includes("translate_timeout_total_budget")) {
        return "The response exceeded the processing time budget.";
    }
    if (normalized.includes("openai_timeout_upstream"))
        return "The upstream AI service timed out.";
    if (normalized.includes("openai_timeout_retry_aborted"))
        return "The request stopped while retrying.";
    if (normalized.startsWith("openai_network_"))
        return "There was a network or upstream connection issue.";
    if (normalized.includes("openai_stream_parse_failed"))
        return "The AI response stream could not be read completely.";
    if (normalized.includes("openai_empty_text"))
        return "The AI response body was empty.";
    if (normalized.includes("openai_responses_429"))
        return "The AI request limit was reached.";
    if (normalized.includes("openai_responses_401"))
        return "The AI account authentication needs to be checked.";
    if (normalized.includes("openai_responses_403"))
        return "Model access or upstream connectivity needs to be checked.";
    if (normalized.includes("openai_responses_404"))
        return "The requested model or endpoint was not found.";
    if (/openai_responses_(500|502|503|504)/.test(normalized))
        return "The AI service had a temporary server error.";
    if (normalized.includes("openai_responses_400"))
        return "The request format or conversation state caused the answer to stop.";
    return "A temporary processing issue prevented the full answer.";
}
function buildAnalyzeResult(query, answer) {
    return {
        answer: sanitizeAnswerText(answer),
        query: normalizeText(query),
    };
}
function translateMedSafetyToEnglish(input) {
    return __awaiter(this, void 0, void 0, function () {
        var sourceText, apiKey, modelCandidates, apiBaseUrls, maxOutputTokens, upstreamTimeoutMs, networkRetries, networkRetryBaseMs, totalBudgetMs, startedAt, lastError, selectedModel, modelIndex, model, baseIndex, apiBaseUrl, remainingMs, timeoutForAttempt, attempt, translated;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    sourceText = sanitizeAnswerText(input.answer || input.rawText);
                    if (!sourceText) {
                        return [2 /*return*/, {
                                result: {
                                    answer: "",
                                    query: "",
                                },
                                rawText: "",
                                model: (_b = (_a = input.model) !== null && _a !== void 0 ? _a : resolveModelCandidates()[0]) !== null && _b !== void 0 ? _b : null,
                                debug: "translate_empty_source",
                            }];
                    }
                    apiKey = normalizeApiKey();
                    modelCandidates = resolveModelCandidates((_c = input.model) !== null && _c !== void 0 ? _c : null);
                    apiBaseUrls = resolveApiBaseUrls();
                    maxOutputTokens = Math.max(1800, Math.min(5000, resolveMaxOutputTokens() + 1000));
                    upstreamTimeoutMs = resolveUpstreamTimeoutMs();
                    networkRetries = resolveNetworkRetryCount();
                    networkRetryBaseMs = resolveNetworkRetryBaseMs();
                    totalBudgetMs = Math.max(resolveTranslateTotalBudgetMs(), Math.min(180000, upstreamTimeoutMs + 30000));
                    startedAt = Date.now();
                    lastError = "openai_translate_failed";
                    selectedModel = (_d = modelCandidates[0]) !== null && _d !== void 0 ? _d : null;
                    modelIndex = 0;
                    _f.label = 1;
                case 1:
                    if (!(modelIndex < modelCandidates.length)) return [3 /*break*/, 6];
                    if (Date.now() - startedAt > totalBudgetMs)
                        throw new Error("openai_translate_timeout_total_budget");
                    model = modelCandidates[modelIndex];
                    selectedModel = model;
                    baseIndex = 0;
                    _f.label = 2;
                case 2:
                    if (!(baseIndex < apiBaseUrls.length)) return [3 /*break*/, 5];
                    if (Date.now() - startedAt > totalBudgetMs)
                        throw new Error("openai_translate_timeout_total_budget");
                    apiBaseUrl = apiBaseUrls[baseIndex];
                    remainingMs = totalBudgetMs - (Date.now() - startedAt);
                    timeoutForAttempt = Math.max(4000, Math.min(upstreamTimeoutMs, remainingMs - 250));
                    if (!Number.isFinite(timeoutForAttempt) || timeoutForAttempt < 4000) {
                        throw new Error("openai_translate_timeout_total_budget");
                    }
                    return [4 /*yield*/, callResponsesApiWithRetry({
                            apiKey: apiKey,
                            model: model,
                            developerPrompt: "Translate the nurse-facing clinical answer into natural bedside clinical English. Return plain text only. Preserve bullets, warnings, names, numbers, units, and uncertainty.",
                            userPrompt: sourceText,
                            apiBaseUrl: apiBaseUrl,
                            signal: input.signal,
                            maxOutputTokens: maxOutputTokens,
                            upstreamTimeoutMs: timeoutForAttempt,
                            verbosity: "medium",
                            reasoningEffort: "medium",
                            storeResponses: false,
                            retries: networkRetries,
                            retryBaseMs: networkRetryBaseMs,
                        })];
                case 3:
                    attempt = _f.sent();
                    if (!attempt.error && attempt.text) {
                        translated = sanitizeAnswerText(attempt.text);
                        return [2 /*return*/, {
                                result: {
                                    answer: translated,
                                    query: "",
                                },
                                rawText: translated,
                                model: model,
                                debug: null,
                            }];
                    }
                    lastError = (_e = attempt.error) !== null && _e !== void 0 ? _e : "openai_translate_failed";
                    _f.label = 4;
                case 4:
                    baseIndex += 1;
                    return [3 /*break*/, 2];
                case 5:
                    modelIndex += 1;
                    return [3 /*break*/, 1];
                case 6: throw new Error(lastError);
            }
        });
    });
}
function isPremiumSearchModel(model) {
    return String(model !== null && model !== void 0 ? model : "").trim().toLowerCase() === "gpt-5.4";
}
function resolveRouteDecision(args) {
    return __awaiter(this, void 0, void 0, function () {
        var deterministic, fallback, attempt;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    deterministic = (0, medSafetyPrompting_1.buildDeterministicRouteDecision)({
                        query: args.query,
                        locale: args.locale,
                        imageDataUrl: args.imageDataUrl,
                    });
                    if (args.runtimeMode === "legacy") {
                        return [2 /*return*/, { decision: deterministic, usage: null }];
                    }
                    if (!(0, medSafetyPrompting_1.shouldUseTinyRouter)({
                        query: args.query,
                        locale: args.locale,
                        imageDataUrl: args.imageDataUrl,
                    }, deterministic)) {
                        return [2 /*return*/, { decision: deterministic, usage: null }];
                    }
                    fallback = (0, medSafetyPrompting_1.buildConservativeRouteDecision)("tiny_router_fallback");
                    return [4 /*yield*/, callResponsesApiWithRetry({
                            apiKey: args.apiKey,
                            model: args.model,
                            developerPrompt: (0, medSafetyPrompting_1.buildTinyRouterDeveloperPrompt)(args.locale),
                            userPrompt: (0, medSafetyPrompting_1.buildTinyRouterUserPrompt)({
                                query: args.query,
                                locale: args.locale,
                                imageDataUrl: args.imageDataUrl,
                            }),
                            apiBaseUrl: args.apiBaseUrl,
                            signal: args.signal,
                            maxOutputTokens: 120,
                            upstreamTimeoutMs: Math.max(20000, Math.min(args.upstreamTimeoutMs, 45000)),
                            verbosity: "low",
                            reasoningEffort: "low",
                            storeResponses: false,
                            retries: args.networkRetries,
                            retryBaseMs: args.networkRetryBaseMs,
                        })];
                case 1:
                    attempt = _b.sent();
                    if (!attempt.error && attempt.text) {
                        return [2 /*return*/, {
                                decision: (0, medSafetyPrompting_1.parseTinyRouterDecision)(attempt.text, deterministic),
                                usage: attempt.usage,
                            }];
                    }
                    return [2 /*return*/, {
                            decision: __assign(__assign({}, fallback), { reason: (_a = attempt.error) !== null && _a !== void 0 ? _a : fallback.reason }),
                            usage: attempt.usage,
                        }];
            }
        });
    });
}
function runQualityGateAndRepair(args) {
    return __awaiter(this, void 0, void 0, function () {
        var heuristicDecision, shouldCallModelGate, gateUsage, modelDecision, gateAttempt, finalGateDecision, repairAttempt, reasoningIndex, reasoningEffort;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    void args.runtimeMode;
                    heuristicDecision = (0, medSafetyPrompting_1.buildHeuristicQualityDecision)(args.answer, args.decision);
                    shouldCallModelGate = (0, medSafetyPrompting_1.shouldRunQualityGate)({
                        decision: args.decision,
                        isPremiumSearch: args.isPremiumSearch,
                        hasImage: args.hasImage,
                        answer: args.answer,
                    });
                    gateUsage = null;
                    modelDecision = null;
                    if (!shouldCallModelGate) return [3 /*break*/, 2];
                    return [4 /*yield*/, callResponsesApiWithRetry({
                            apiKey: args.apiKey,
                            model: args.model,
                            developerPrompt: (0, medSafetyPrompting_1.buildQualityGateDeveloperPrompt)(),
                            userPrompt: (0, medSafetyPrompting_1.buildQualityGateUserPrompt)({
                                query: args.query,
                                answer: args.answer,
                                locale: args.locale,
                                decision: args.decision,
                                promptAssembly: (_a = args.promptAssembly) !== null && _a !== void 0 ? _a : null,
                            }),
                            apiBaseUrl: args.apiBaseUrl,
                            signal: args.signal,
                            maxOutputTokens: 220,
                            upstreamTimeoutMs: Math.max(20000, Math.min(args.upstreamTimeoutMs, 45000)),
                            verbosity: "low",
                            reasoningEffort: args.isPremiumSearch ? "medium" : "low",
                            storeResponses: false,
                            retries: args.networkRetries,
                            retryBaseMs: args.networkRetryBaseMs,
                        })];
                case 1:
                    gateAttempt = _f.sent();
                    gateUsage = gateAttempt.usage;
                    if (!gateAttempt.error && gateAttempt.text) {
                        modelDecision = (0, medSafetyPrompting_1.parseQualityGateDecision)(gateAttempt.text);
                    }
                    _f.label = 2;
                case 2:
                    finalGateDecision = mergeQualityDecisions(heuristicDecision, modelDecision);
                    if (finalGateDecision.verdict === "pass" || !args.allowRepair) {
                        return [2 /*return*/, {
                                answer: args.answer,
                                gateDecision: finalGateDecision,
                                gateUsage: gateUsage,
                                repairUsage: null,
                                totalUsage: gateUsage,
                                repaired: false,
                            }];
                    }
                    repairAttempt = {
                        text: null,
                        error: "repair_not_attempted",
                        responseId: null,
                        conversationId: null,
                        usage: null,
                    };
                    reasoningIndex = 0;
                    _f.label = 3;
                case 3:
                    if (!(reasoningIndex < args.profile.reasoningEfforts.length)) return [3 /*break*/, 6];
                    reasoningEffort = (_b = args.profile.reasoningEfforts[reasoningIndex]) !== null && _b !== void 0 ? _b : "medium";
                    return [4 /*yield*/, callResponsesApiWithRetry({
                            apiKey: args.apiKey,
                            model: args.model,
                            developerPrompt: (0, medSafetyPrompting_1.buildRepairDeveloperPrompt)(args.locale),
                            userPrompt: (0, medSafetyPrompting_1.buildRepairUserPrompt)({
                                query: args.query,
                                answer: args.answer,
                                locale: args.locale,
                                decision: args.decision,
                                repairInstructions: finalGateDecision.repairInstructions,
                                promptAssembly: (_c = args.promptAssembly) !== null && _c !== void 0 ? _c : null,
                            }),
                            apiBaseUrl: args.apiBaseUrl,
                            signal: args.signal,
                            maxOutputTokens: (_d = args.profile.outputTokenCandidates[0]) !== null && _d !== void 0 ? _d : 1200,
                            upstreamTimeoutMs: args.upstreamTimeoutMs,
                            verbosity: args.profile.verbosity,
                            reasoningEffort: reasoningEffort,
                            storeResponses: false,
                            retries: args.networkRetries,
                            retryBaseMs: args.networkRetryBaseMs,
                        })];
                case 4:
                    repairAttempt = _f.sent();
                    if (!repairAttempt.error && repairAttempt.text) {
                        return [2 /*return*/, {
                                answer: sanitizeAnswerText(repairAttempt.text),
                                gateDecision: finalGateDecision,
                                gateUsage: gateUsage,
                                repairUsage: repairAttempt.usage,
                                totalUsage: sumUsages(gateUsage, repairAttempt.usage),
                                repaired: true,
                            }];
                    }
                    if (!isReasoningEffortRejected((_e = repairAttempt.error) !== null && _e !== void 0 ? _e : "") || reasoningIndex + 1 >= args.profile.reasoningEfforts.length) {
                        return [3 /*break*/, 6];
                    }
                    _f.label = 5;
                case 5:
                    reasoningIndex += 1;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/, {
                        answer: args.answer,
                        gateDecision: finalGateDecision,
                        gateUsage: gateUsage,
                        repairUsage: repairAttempt.usage,
                        totalUsage: sumUsages(gateUsage, repairAttempt.usage),
                        repaired: false,
                    }];
            }
        });
    });
}
function analyzeMedSafetyWithOpenAI(params) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, runtimeMode, modelCandidates, apiBaseUrls, upstreamTimeoutMs, totalBudgetMs, networkRetries, networkRetryBaseMs, storeResponses, legacyDeveloperPrompt, userPrompt, memoryAwareUserPrompt, startedAt, selectedModel, lastError, lastRouteDecision, modelIndex, candidateModel, baseIndex, apiBaseUrl, useContinuationState, previousResponseId, conversationId, shouldUseContinuationIds, isPremiumSearch, routeDecision, routeUsage, promptProfile, resolvedRoute, promptAssembly, mainDeveloperPrompt, shouldSuppressStreamingForQuality, allowStreaming, primaryUserPrompt, mainAttempt, finalAnswer, gateUsage, repairUsage, shadowComparison, quality, hybridAttempt, hybridAnswer, hybridHeuristic, pairwiseQualityFlags, verbosityFlags, result, fallbackAnswer;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    apiKey = normalizeApiKey();
                    runtimeMode = (0, medSafetyPrompting_1.resolveMedSafetyRuntimeMode)();
                    modelCandidates = resolveModelCandidates(params.modelOverride);
                    apiBaseUrls = resolveApiBaseUrls();
                    upstreamTimeoutMs = resolveUpstreamTimeoutMs();
                    totalBudgetMs = Math.max(resolveTotalBudgetMs(), Math.min(900000, upstreamTimeoutMs + 120000));
                    networkRetries = resolveNetworkRetryCount();
                    networkRetryBaseMs = resolveNetworkRetryBaseMs();
                    storeResponses = resolveStoreResponses();
                    legacyDeveloperPrompt = buildDeveloperPrompt(params.locale);
                    userPrompt = buildUserPrompt(params.query, params.locale);
                    memoryAwareUserPrompt = buildUserPromptWithContinuationMemory(userPrompt, params.continuationMemory, params.locale);
                    startedAt = Date.now();
                    selectedModel = (_a = modelCandidates[0]) !== null && _a !== void 0 ? _a : MED_SAFETY_LOCKED_MODEL;
                    lastError = "openai_request_failed";
                    lastRouteDecision = null;
                    modelIndex = 0;
                    _l.label = 1;
                case 1:
                    if (!(modelIndex < modelCandidates.length)) return [3 /*break*/, 11];
                    if (Date.now() - startedAt > totalBudgetMs) {
                        lastError = "openai_timeout_total_budget";
                        return [3 /*break*/, 11];
                    }
                    candidateModel = modelCandidates[modelIndex];
                    selectedModel = candidateModel;
                    baseIndex = 0;
                    _l.label = 2;
                case 2:
                    if (!(baseIndex < apiBaseUrls.length)) return [3 /*break*/, 10];
                    if (Date.now() - startedAt > totalBudgetMs) {
                        lastError = "openai_timeout_total_budget";
                        return [3 /*break*/, 10];
                    }
                    apiBaseUrl = apiBaseUrls[baseIndex];
                    useContinuationState = modelIndex === 0 && baseIndex === 0;
                    previousResponseId = useContinuationState ? params.previousResponseId : undefined;
                    conversationId = useContinuationState ? params.conversationId : undefined;
                    shouldUseContinuationIds = Boolean(previousResponseId || conversationId);
                    isPremiumSearch = isPremiumSearchModel(candidateModel);
                    routeDecision = void 0;
                    routeUsage = null;
                    promptProfile = {
                        reasoningEfforts: ["medium"],
                        verbosity: "medium",
                        outputTokenCandidates: buildOutputTokenCandidates(resolveMaxOutputTokens()),
                        qualityLevel: "balanced",
                    };
                    return [4 /*yield*/, resolveRouteDecision({
                            runtimeMode: runtimeMode,
                            query: params.query,
                            locale: params.locale,
                            imageDataUrl: params.imageDataUrl,
                            apiKey: apiKey,
                            model: candidateModel,
                            apiBaseUrl: apiBaseUrl,
                            signal: params.signal,
                            upstreamTimeoutMs: upstreamTimeoutMs,
                            networkRetries: networkRetries,
                            networkRetryBaseMs: networkRetryBaseMs,
                        })];
                case 3:
                    resolvedRoute = _l.sent();
                    routeDecision = resolvedRoute.decision;
                    routeUsage = resolvedRoute.usage;
                    lastRouteDecision = routeDecision;
                    promptProfile = (0, medSafetyPrompting_1.buildPromptProfile)({
                        decision: routeDecision,
                        model: candidateModel,
                        isPremiumSearch: isPremiumSearch,
                        hasImage: Boolean(params.imageDataUrl),
                    });
                    promptAssembly = (0, medSafetyPrompting_1.assembleMedSafetyDeveloperPrompt)(routeDecision, params.locale, {
                        runtimeMode: runtimeMode,
                        hasImage: Boolean(params.imageDataUrl),
                    });
                    mainDeveloperPrompt = runtimeMode === "hybrid_live" ? promptAssembly.developerPrompt : legacyDeveloperPrompt;
                    shouldSuppressStreamingForQuality = runtimeMode === "hybrid_live" &&
                        (0, medSafetyPrompting_1.shouldRunQualityGate)({
                            decision: routeDecision,
                            isPremiumSearch: isPremiumSearch,
                            hasImage: Boolean(params.imageDataUrl),
                        });
                    allowStreaming = Boolean(params.onTextDelta) &&
                        modelIndex === 0 &&
                        baseIndex === 0 &&
                        !shouldSuppressStreamingForQuality;
                    logHybridDiagnostics({
                        runtimeMode: runtimeMode,
                        stage: "router",
                        model: candidateModel,
                        routeDecision: routeDecision,
                        usage: routeUsage,
                        promptChars: mainDeveloperPrompt.length,
                        extra: __assign({ mainPromptMode: runtimeMode === "hybrid_live" ? "behavioral_contract_v2" : "legacy_monolithic", actualPromptChars: mainDeveloperPrompt.length, tokenCandidates: promptProfile.outputTokenCandidates.join(","), reasoningEfforts: promptProfile.reasoningEfforts.join(",") }, buildPromptDisciplineDiagnostics(routeDecision, promptProfile, promptAssembly)),
                    });
                    primaryUserPrompt = shouldUseContinuationIds ? userPrompt : memoryAwareUserPrompt;
                    return [4 /*yield*/, generateAnswerWithPrompt({
                            apiKey: apiKey,
                            model: candidateModel,
                            developerPrompt: mainDeveloperPrompt,
                            userPrompt: primaryUserPrompt,
                            apiBaseUrl: apiBaseUrl,
                            imageDataUrl: params.imageDataUrl,
                            previousResponseId: previousResponseId,
                            conversationId: conversationId,
                            signal: params.signal,
                            upstreamTimeoutMs: upstreamTimeoutMs,
                            storeResponses: storeResponses,
                            profile: promptProfile,
                            onTextDelta: allowStreaming ? params.onTextDelta : undefined,
                            allowStreaming: allowStreaming,
                            networkRetries: networkRetries,
                            networkRetryBaseMs: networkRetryBaseMs,
                        })];
                case 4:
                    mainAttempt = _l.sent();
                    if (mainAttempt.error || !mainAttempt.answerText) {
                        lastError = (_b = mainAttempt.error) !== null && _b !== void 0 ? _b : "openai_empty_text";
                        return [3 /*break*/, 9];
                    }
                    finalAnswer = sanitizeAnswerText(mainAttempt.answerText);
                    gateUsage = null;
                    repairUsage = null;
                    shadowComparison = null;
                    logHybridDiagnostics({
                        runtimeMode: runtimeMode,
                        stage: mainAttempt.stage,
                        model: candidateModel,
                        routeDecision: routeDecision,
                        usage: sumUsages(routeUsage, mainAttempt.usage),
                        promptChars: mainDeveloperPrompt.length,
                        extra: __assign({ streamed: mainAttempt.streamed, reasoningEffort: mainAttempt.reasoningEffort, maxOutputTokens: mainAttempt.maxOutputTokens, mainPromptMode: runtimeMode === "hybrid_live" ? "behavioral_contract_v2" : "legacy_monolithic" }, buildPromptDisciplineDiagnostics(routeDecision, promptProfile, promptAssembly)),
                    });
                    if (!(runtimeMode === "hybrid_live")) return [3 /*break*/, 6];
                    return [4 /*yield*/, runQualityGateAndRepair({
                            runtimeMode: runtimeMode,
                            query: params.query,
                            locale: params.locale,
                            answer: finalAnswer,
                            decision: routeDecision,
                            promptAssembly: promptAssembly,
                            apiKey: apiKey,
                            model: candidateModel,
                            apiBaseUrl: apiBaseUrl,
                            signal: params.signal,
                            upstreamTimeoutMs: upstreamTimeoutMs,
                            networkRetries: networkRetries,
                            networkRetryBaseMs: networkRetryBaseMs,
                            profile: promptProfile,
                            hasImage: Boolean(params.imageDataUrl),
                            isPremiumSearch: isPremiumSearch,
                            allowRepair: !mainAttempt.streamed,
                        })];
                case 5:
                    quality = _l.sent();
                    finalAnswer = sanitizeAnswerText(quality.answer);
                    gateUsage = quality.gateUsage;
                    repairUsage = quality.repairUsage;
                    logHybridDiagnostics({
                        runtimeMode: runtimeMode,
                        stage: "quality_gate",
                        model: candidateModel,
                        routeDecision: routeDecision,
                        usage: quality.totalUsage,
                        promptChars: mainDeveloperPrompt.length,
                        extra: __assign({ verdict: (_d = (_c = quality.gateDecision) === null || _c === void 0 ? void 0 : _c.verdict) !== null && _d !== void 0 ? _d : "not_run", repaired: quality.repaired, allowRepair: !mainAttempt.streamed, repairReason: ((_e = quality.gateDecision) === null || _e === void 0 ? void 0 : _e.repairInstructions) ? truncateError(quality.gateDecision.repairInstructions, 320) : null }, buildPromptDisciplineDiagnostics(routeDecision, promptProfile, promptAssembly)),
                    });
                    return [3 /*break*/, 8];
                case 6:
                    if (!(runtimeMode === "hybrid_shadow")) return [3 /*break*/, 8];
                    return [4 /*yield*/, generateAnswerWithPrompt({
                            apiKey: apiKey,
                            model: candidateModel,
                            developerPrompt: promptAssembly.developerPrompt,
                            userPrompt: primaryUserPrompt,
                            apiBaseUrl: apiBaseUrl,
                            imageDataUrl: params.imageDataUrl,
                            previousResponseId: previousResponseId,
                            conversationId: conversationId,
                            signal: params.signal,
                            upstreamTimeoutMs: upstreamTimeoutMs,
                            storeResponses: false,
                            profile: promptProfile,
                            allowStreaming: false,
                            networkRetries: networkRetries,
                            networkRetryBaseMs: networkRetryBaseMs,
                        })];
                case 7:
                    hybridAttempt = _l.sent();
                    hybridAnswer = hybridAttempt.answerText ? sanitizeAnswerText(hybridAttempt.answerText) : null;
                    hybridHeuristic = hybridAnswer ? (0, medSafetyPrompting_1.buildHeuristicQualityDecision)(hybridAnswer, routeDecision) : null;
                    pairwiseQualityFlags = [];
                    verbosityFlags = [];
                    if (!hybridAnswer) {
                        pairwiseQualityFlags.push("hybrid_failed");
                    }
                    else {
                        if ((hybridHeuristic === null || hybridHeuristic === void 0 ? void 0 : hybridHeuristic.verdict) === "repair_required")
                            pairwiseQualityFlags.push("hybrid_requires_repair");
                        if ((hybridHeuristic === null || hybridHeuristic === void 0 ? void 0 : hybridHeuristic.verdict) === "pass_but_verbose")
                            pairwiseQualityFlags.push("hybrid_verbose");
                        if (normalizeText(hybridAnswer).length > normalizeText(finalAnswer).length) {
                            pairwiseQualityFlags.push("hybrid_longer_than_legacy");
                            verbosityFlags.push("more_chars_than_legacy");
                        }
                        if (countVisibleAnswerLines(hybridAnswer) > countVisibleAnswerLines(finalAnswer)) {
                            verbosityFlags.push("more_lines_than_legacy");
                        }
                        if (((_g = (_f = hybridAttempt.usage) === null || _f === void 0 ? void 0 : _f.reasoningTokens) !== null && _g !== void 0 ? _g : 0) > 0) {
                            pairwiseQualityFlags.push("hybrid_reasoning_tokens_present");
                        }
                    }
                    shadowComparison = {
                        legacyAnswer: finalAnswer,
                        hybridAnswer: hybridAnswer,
                        legacyUsage: mainAttempt.usage,
                        hybridUsage: hybridAttempt.usage,
                        heuristicVerdict: (_h = hybridHeuristic === null || hybridHeuristic === void 0 ? void 0 : hybridHeuristic.verdict) !== null && _h !== void 0 ? _h : "hybrid_failed",
                        heuristicRepairInstructions: (_j = hybridHeuristic === null || hybridHeuristic === void 0 ? void 0 : hybridHeuristic.repairInstructions) !== null && _j !== void 0 ? _j : truncateError((_k = hybridAttempt.error) !== null && _k !== void 0 ? _k : "", 220),
                        pairwiseQualityFlags: pairwiseQualityFlags,
                        verbosityFlags: verbosityFlags,
                        overlong: Boolean(hybridHeuristic === null || hybridHeuristic === void 0 ? void 0 : hybridHeuristic.repairInstructions.includes("overlong_answer")),
                        selectedContracts: promptAssembly.selectedContractIds,
                    };
                    logHybridDiagnostics({
                        runtimeMode: runtimeMode,
                        stage: "shadow_compare",
                        model: candidateModel,
                        routeDecision: routeDecision,
                        usage: sumUsages(routeUsage, mainAttempt.usage, hybridAttempt.usage),
                        promptChars: promptAssembly.finalPromptChars,
                        extra: {
                            legacyPromptChars: legacyDeveloperPrompt.length,
                            hybridPromptChars: promptAssembly.finalPromptChars,
                            heuristicVerdict: shadowComparison.heuristicVerdict,
                            heuristicRepairInstructions: shadowComparison.heuristicRepairInstructions,
                            pairwiseQualityFlags: shadowComparison.pairwiseQualityFlags,
                            verbosityFlags: shadowComparison.verbosityFlags,
                            selectedContracts: promptAssembly.selectedContractIds,
                        },
                    });
                    _l.label = 8;
                case 8:
                    result = buildAnalyzeResult(params.query, finalAnswer);
                    return [2 /*return*/, {
                            result: result,
                            model: candidateModel,
                            rawText: result.answer,
                            fallbackReason: null,
                            openaiResponseId: mainAttempt.responseId,
                            openaiConversationId: mainAttempt.conversationId,
                            routeDecision: routeDecision,
                            runtimeMode: runtimeMode,
                            usageBreakdown: buildUsageBreakdown({
                                runtimeMode: runtimeMode,
                                routeDecision: routeDecision,
                                routerUsage: routeUsage,
                                mainUsage: mainAttempt.usage,
                                gateUsage: gateUsage,
                                repairUsage: repairUsage,
                                answer: result.answer,
                                assembledPromptChars: mainDeveloperPrompt.length,
                                selectedContracts: runtimeMode === "legacy" ? [] : promptAssembly.selectedContractIds,
                            }),
                            shadowComparison: shadowComparison,
                        }];
                case 9:
                    baseIndex += 1;
                    return [3 /*break*/, 2];
                case 10:
                    modelIndex += 1;
                    return [3 /*break*/, 1];
                case 11:
                    fallbackAnswer = buildFallbackAnswer(params.query, params.locale, lastError);
                    return [2 /*return*/, {
                            result: buildAnalyzeResult(params.query, fallbackAnswer),
                            model: selectedModel,
                            rawText: fallbackAnswer,
                            fallbackReason: lastError,
                            openaiResponseId: null,
                            openaiConversationId: null,
                            routeDecision: lastRouteDecision,
                            runtimeMode: runtimeMode,
                            usageBreakdown: buildUsageBreakdown({
                                runtimeMode: runtimeMode,
                                routeDecision: lastRouteDecision,
                                answer: fallbackAnswer,
                                selectedContracts: [],
                            }),
                            shadowComparison: null,
                        }];
            }
        });
    });
}
