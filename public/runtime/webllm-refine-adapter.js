(function initHandoffWebLlmAdapter(root) {
  "use strict";

  function normalizeWhitespace(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function uniqueStrings(values) {
    if (!Array.isArray(values)) return [];
    var out = [];
    var seen = new Set();
    for (var i = 0; i < values.length; i += 1) {
      var next = normalizeWhitespace(values[i]);
      if (!next) continue;
      var key = next.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(next);
    }
    return out;
  }

  function stripAliasNoise(text) {
    return normalizeWhitespace(text)
      .replace(/PATIENT_[A-Z0-9]+\s*(질환\/)?/g, "")
      .replace(/\b(해당\s*환자|환자)\b/g, "")
      .replace(/^\s*(는|은|이|가)\s*/g, "")
      .replace(/^[,.:;\\-\\s]+/, "")
      .replace(/[,.。·;:]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function shortenTask(task) {
    var text = stripAliasNoise(task);
    if (!text) return "";

    var chunks = text
      .split(/[,.]/)
      .map(function (chunk) {
        return normalizeWhitespace(chunk);
      })
      .filter(Boolean);
    if (chunks.length > 1) {
      text = chunks[0];
    }

    text = text
      .replace(/\s*(입니다|였음|있음|유지중|유지 중)\s*$/g, "")
      .replace(/\s*(필요합니다|필요함)\s*$/g, " 필요")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (text.length > 56) {
      text = text.slice(0, 56).trim() + "…";
    }
    return text;
  }

  function inferOwner(task, fallback) {
    var text = stripAliasNoise(task);
    if (!text) return fallback;
    if (/(검사|CBC|CRP|WBC|배양|LAB|혈액검사)/i.test(text)) return "LAB";
    if (/(호흡|산소|기도|SpO2|흡인|환기)/i.test(text)) return "RT";
    if (/(오더|처방|의사|보고|콜)/i.test(text)) return "MD";
    return fallback || "RN";
  }

  function inferDue(task, priority, fallback) {
    if (fallback === "now" || fallback === "within_1h" || fallback === "today" || fallback === "next_shift") {
      return fallback;
    }

    var text = stripAliasNoise(task);
    if (!text) {
      if (priority === "P0") return "now";
      if (priority === "P1") return "within_1h";
      return undefined;
    }

    if (/\b\d{1,2}:\d{2}\b/.test(text) || /\d{1,2}\s*시/.test(text)) return "today";
    if (/(즉시|지금|바로|응급|STAT)/i.test(text)) return "now";
    if (/(30분|1시간|한시간|within\s*1h|새벽)/i.test(text)) return "within_1h";
    if (/(오늘|금일|오전|오후|저녁|밤)/i.test(text)) return "today";
    if (/(다음\s*근무|다음\s*인계|익일|내일)/i.test(text)) return "next_shift";
    if (priority === "P0") return "now";
    if (priority === "P1") return "within_1h";
    if (/(재측정|재확인|재평가|모니터링|관찰|체크|확인|결과|추적)/i.test(text)) return "today";
    return undefined;
  }

  function priorityRank(priority) {
    if (priority === "P0") return 0;
    if (priority === "P1") return 1;
    return 2;
  }

  function normalizePlan(plan) {
    if (!Array.isArray(plan)) return [];
    var seen = new Set();
    var normalized = [];

    for (var i = 0; i < plan.length; i += 1) {
      var todo = plan[i] || {};
      var task = shortenTask(todo.task);
      if (!task) continue;
      var key = task.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      var priority = todo.priority === "P0" || todo.priority === "P1" || todo.priority === "P2" ? todo.priority : "P2";
      var due = inferDue(task, priority, todo.due);
      var owner = inferOwner(task, todo.owner);
      normalized.push({
        priority: priority,
        task: task,
        due: due,
        owner: owner === "RN" || owner === "MD" || owner === "RT" || owner === "LAB" ? owner : undefined,
      });
    }

    normalized.sort(function (a, b) {
      return priorityRank(a.priority) - priorityRank(b.priority);
    });

    return normalized;
  }

  function buildQuestions(patient, plan) {
    var questions = uniqueStrings(patient && patient.questions);
    if (!plan.length) {
      questions.push("추가 오더 및 우선 수행 작업 재확인 필요");
    }
    var hasDueGap = plan.some(function (todo) {
      return (todo.priority === "P0" || todo.priority === "P1") && !todo.due;
    });
    if (hasDueGap) {
      questions.push("작업 기한(now/within_1h/today/next_shift) 명확화 필요");
    }
    if (!questions.length) {
      questions.push("핵심 오더 우선순위와 실행 시점 재확인");
    }
    return uniqueStrings(questions);
  }

  function buildSummary(patient, plan) {
    var current = normalizeWhitespace(patient && patient.summary1);
    if (current) return current;
    var key = normalizeWhitespace(patient && patient.patientKey) || "PATIENT";
    var top = plan[0];
    if (top && top.task) return "".concat(key, ": ").concat(top.priority || "P2", " ").concat(top.task);
    return "".concat(key, ": 상태 재평가 필요");
  }

  function heuristicRefine(result) {
    if (!result || !Array.isArray(result.patients)) return null;
    return {
      patients: result.patients.map(function (patient) {
        var normalizedPlan = normalizePlan(patient.plan);
        return {
          patientKey: patient.patientKey,
          summary1: buildSummary(patient, normalizedPlan),
          watchFor: uniqueStrings(patient.watchFor).map(shortenTask),
          questions: buildQuestions(patient, normalizedPlan),
          plan: normalizedPlan,
        };
      }),
    };
  }

  function resolveBackend() {
    var custom = root.__RNEST_WEBLLM_BACKEND__;
    if (typeof custom === "function") {
      return {
        async refine(input) {
          return custom(input);
        },
      };
    }

    if (custom && typeof custom.refine === "function") {
      return custom;
    }

    return null;
  }

  async function runAdapter(input) {
    var result = input && input.result;
    var backend = resolveBackend();

    if (backend) {
      try {
        var backendOutput = await backend.refine({ result: result });
        if (backendOutput) return backendOutput;
      } catch (error) {
        console.warn("[handoff-webllm] custom backend failed", error);
      }
    }

    return heuristicRefine(result);
  }

  root.__RNEST_WEBLLM_REFINE__ = async function handoffWebLlmAdapter(input) {
    return runAdapter(input || {});
  };
})(window);
