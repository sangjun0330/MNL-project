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
      var task = normalizeWhitespace(todo.task);
      if (!task) continue;
      var key = task.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({
        priority: todo.priority === "P0" || todo.priority === "P1" || todo.priority === "P2" ? todo.priority : "P2",
        task: task,
        due:
          todo.due === "now" ||
          todo.due === "within_1h" ||
          todo.due === "today" ||
          todo.due === "next_shift"
            ? todo.due
            : undefined,
        owner:
          todo.owner === "RN" || todo.owner === "MD" || todo.owner === "RT" || todo.owner === "LAB"
            ? todo.owner
            : undefined,
      });
    }

    normalized.sort(function (a, b) {
      return priorityRank(a.priority) - priorityRank(b.priority);
    });

    return normalized;
  }

  function heuristicRefine(result) {
    if (!result || !Array.isArray(result.patients)) return null;
    return {
      patients: result.patients.map(function (patient) {
        return {
          patientKey: patient.patientKey,
          summary1: normalizeWhitespace(patient.summary1),
          watchFor: uniqueStrings(patient.watchFor),
          questions: uniqueStrings(patient.questions),
          plan: normalizePlan(patient.plan),
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
