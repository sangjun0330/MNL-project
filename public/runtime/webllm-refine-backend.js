(function initHandoffWebLlmBackend(root) {
  "use strict";

  function normalizeWhitespace(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function uniqueStrings(values, limit) {
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
      if (typeof limit === "number" && out.length >= limit) break;
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

  function normalizeTodoPriority(priority) {
    if (priority === "P0" || priority === "P1" || priority === "P2") return priority;
    return "P2";
  }

  function inferOwner(task, fallback) {
    var text = stripAliasNoise(task);
    if (!text) return fallback;
    if (/(검사|CBC|CRP|WBC|배양|LAB|혈액검사)/i.test(text)) return "LAB";
    if (/(호흡|산소|기도|SpO2|흡인|환기)/i.test(text)) return "RT";
    if (/(오더|처방|의사|보고|콜)/i.test(text)) return "MD";
    return fallback || "RN";
  }

  function normalizeDue(due) {
    if (due === "now" || due === "within_1h" || due === "today" || due === "next_shift") {
      return due;
    }
    return undefined;
  }

  function inferDue(task, priority, fallback) {
    var normalizedFallback = normalizeDue(fallback);
    if (normalizedFallback) return normalizedFallback;

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

  function normalizePlan(plan, riskActions) {
    var source = Array.isArray(plan) ? plan : [];
    var merged = source.slice();

    if (!merged.length && Array.isArray(riskActions) && riskActions.length) {
      for (var i = 0; i < riskActions.length; i += 1) {
        merged.push({
          priority: i === 0 ? "P0" : "P1",
          task: riskActions[i],
        });
      }
    }

    var seen = new Set();
    var out = [];
    for (var idx = 0; idx < merged.length; idx += 1) {
      var todo = merged[idx] || {};
      var task = shortenTask(todo.task);
      if (!task) continue;
      var key = task.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      var priority = normalizeTodoPriority(todo.priority);
      var due = inferDue(task, priority, todo.due);
      var owner = inferOwner(task, todo.owner);

      out.push({
        priority: priority,
        task: task,
        due: due,
        owner: owner === "RN" || owner === "MD" || owner === "RT" || owner === "LAB" ? owner : undefined,
      });
    }

    out.sort(function (a, b) {
      var rank = { P0: 0, P1: 1, P2: 2 };
      var left = rank[a.priority] != null ? rank[a.priority] : 2;
      var right = rank[b.priority] != null ? rank[b.priority] : 2;
      return left - right;
    });

    return out.slice(0, 6);
  }

  function summarizeRisk(patient) {
    var risks = Array.isArray(patient && patient.risks) ? patient.risks : [];
    if (!risks.length) return "핵심 위험 신호 재확인 필요";
    var sorted = risks
      .slice()
      .sort(function (a, b) {
        return Number(b && b.score) - Number(a && a.score);
      })
      .filter(function (risk) {
        return risk && typeof risk.code === "string";
      });
    if (!sorted.length) return "핵심 위험 신호 재확인 필요";
    var top = sorted[0];
    return "".concat(top.code, " 위험 ").concat(Number(top.score || 0), "점");
  }

  function summarizeStatus(patient) {
    var status = uniqueStrings(patient && patient.currentStatus, 2).map(stripAliasNoise);
    var problems = uniqueStrings(patient && patient.problems, 1).map(stripAliasNoise);
    var source = status.concat(problems).join(" ");
    if (!source) return "상태 재평가 필요";

    var bp = source.match(/(?:혈압|BP)\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
    if (bp) return "혈압 ".concat(bp[1], "/").concat(bp[2], " 저하 여부 추적");
    var glucose = source.match(/(?:혈당|BST|glucose)\s*(\d{2,3})/i);
    if (glucose) return "혈당 ".concat(glucose[1], " 추적");
    var spo2 = source.match(/(?:산소포화도|SpO2)\s*(\d{2,3})/i);
    if (spo2) return "산소포화도 ".concat(spo2[1], "% 추적");
    if (/(흑변|출혈|혈변|토혈)/i.test(source)) return "출혈 징후 추적";
    if (/(소변량|I\/O|섭취\/?배설량|요량)/i.test(source)) return "소변량/I/O 추적";

    if (status.length) return shortenTask(status[0]);
    if (problems.length) return shortenTask(problems[0]);
    return "상태 재평가 필요";
  }

  function summarizeUrgent(plan) {
    if (!Array.isArray(plan) || !plan.length) return "즉시 수행할 작업 없음";
    var p0 = plan.find(function (todo) {
      return todo && todo.priority === "P0";
    });
    var top = p0 || plan[0];
    if (!top || !top.task) return "즉시 수행할 작업 없음";
    return "".concat(top.priority || "P2", " ").concat(shortenTask(top.task));
  }

  function buildSummary(patient, normalizedPlan) {
    var patientKey = normalizeWhitespace(patient && patient.patientKey) || "PATIENT";
    var riskSummary = summarizeRisk(patient);
    var statusSummary = summarizeStatus(patient);
    var urgentSummary = summarizeUrgent(normalizedPlan);
    return "".concat(patientKey, ": ").concat(riskSummary, " \xb7 ").concat(statusSummary, " \xb7 ").concat(urgentSummary);
  }

  function buildWatchFor(patient) {
    var watch = uniqueStrings(patient && patient.watchFor, 4).map(shortenTask);
    var risks = Array.isArray(patient && patient.risks) ? patient.risks : [];
    for (var i = 0; i < risks.length; i += 1) {
      var risk = risks[i] || {};
      var firstAction = Array.isArray(risk.actions) && risk.actions.length ? normalizeWhitespace(risk.actions[0]) : "";
      if (firstAction) watch.push("".concat(risk.code || "RISK", ": ").concat(shortenTask(firstAction)));
    }
    return uniqueStrings(watch, 6);
  }

  function buildQuestions(patient, normalizedPlan, uncertaintyReasons) {
    var questions = uniqueStrings(patient && patient.questions, 3);
    if (!normalizedPlan.length) {
      questions.push("추가 오더 및 우선 수행 작업 재확인 필요");
    }

    var hasOwnerGap = normalizedPlan.some(function (todo) {
      return (todo.priority === "P0" || todo.priority === "P1") && !todo.owner;
    });
    if (hasOwnerGap) {
      questions.push("작업 담당자(RN/MD/RT/LAB) 지정 필요");
    }

    var hasDueGap = normalizedPlan.some(function (todo) {
      return (todo.priority === "P0" || todo.priority === "P1") && !todo.due;
    });
    if (hasDueGap) {
      questions.push("작업 기한(now/within_1h/today/next_shift) 명확화 필요");
    }

    if (Array.isArray(uncertaintyReasons) && uncertaintyReasons.length) {
      for (var i = 0; i < uncertaintyReasons.length; i += 1) {
        var reason = shortenTask(uncertaintyReasons[i]);
        if (reason) questions.push("검수 필요: ".concat(reason));
      }
    }

    var risks = Array.isArray(patient && patient.risks) ? patient.risks : [];
    if (risks.length) {
      var sorted = risks
        .slice()
        .sort(function (a, b) {
          return Number(b && b.score) - Number(a && a.score);
        })
        .filter(function (risk) {
          return risk && typeof risk.code === "string";
        });
      if (sorted.length) {
        questions.push("".concat(sorted[0].code, " 악화 기준/호출 시점 재확인"));
      }
    }

    if (!questions.length) {
      questions.push("핵심 오더 우선순위와 실행 시점 재확인");
    }

    return uniqueStrings(questions, 5);
  }

  function normalizePatientPatch(patient, uncertaintyReasons) {
    var safe = patient || {};
    var riskActions = [];
    var risks = Array.isArray(safe.risks) ? safe.risks : [];
    for (var i = 0; i < risks.length; i += 1) {
      var risk = risks[i] || {};
      if (!Array.isArray(risk.actions)) continue;
      for (var j = 0; j < risk.actions.length; j += 1) {
        var action = normalizeWhitespace(risk.actions[j]);
        if (action) riskActions.push(action);
      }
    }

    var normalizedPlan = normalizePlan(safe.plan, riskActions);
    return {
      patientKey: safe.patientKey,
      summary1: buildSummary(safe, normalizedPlan),
      watchFor: buildWatchFor(safe),
      questions: buildQuestions(safe, normalizedPlan, uncertaintyReasons),
      plan: normalizedPlan,
    };
  }

  function buildUncertaintyMap(result) {
    var map = {};
    var globalReasons = [];
    var items = Array.isArray(result && result.uncertaintyItems) ? result.uncertaintyItems : [];
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i] || {};
      var reason = normalizeWhitespace(item.reason || "");
      if (!reason) continue;
      var text = normalizeWhitespace(item.text || "");
      var aliases = text.match(/PATIENT_[A-Z0-9]+/g) || [];
      if (!aliases.length) {
        globalReasons.push(reason);
      }
      for (var j = 0; j < aliases.length; j += 1) {
        var alias = aliases[j];
        if (!map[alias]) map[alias] = [];
        map[alias].push(reason);
      }
    }
    if (globalReasons.length) {
      map["*"] = uniqueStrings(globalReasons, 3);
    }
    return map;
  }

  root.__RNEST_WEBLLM_BACKEND__ = {
    runtime: "local_clinical_backend_v2",
    async refine(input) {
      var result = input && input.result;
      if (!result || !Array.isArray(result.patients)) return null;
      var uncertaintyMap = buildUncertaintyMap(result);
      var globalUncertaintyReasons = uncertaintyMap["*"] || [];
      return {
        patients: result.patients.map(function (patient) {
          var key = normalizeWhitespace(patient && patient.patientKey);
          var patientReasons = key ? uncertaintyMap[key] || [] : [];
          var uncertaintyReasons = patientReasons.concat(globalUncertaintyReasons);
          return normalizePatientPatch(patient, uncertaintyReasons);
        }),
      };
    },
  };
})(window);
