import test from "node:test";
import assert from "node:assert/strict";
import { patchWebLlmAppConfigForCsp } from "../webLlmMlcBackend";

test("patchWebLlmAppConfigForCsp rewrites raw.githubusercontent model_lib for target model", () => {
  const modelId = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
  const rawUrl =
    "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_90/qwen2.5_3b.wasm";
  const moduleRef = {
    prebuiltAppConfig: {
      model_list: [
        {
          model_id: modelId,
          model: "https://huggingface.co/mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC",
          model_lib: rawUrl,
        },
      ],
      useIndexedDBCache: true,
    },
  };

  const patched = patchWebLlmAppConfigForCsp(
    moduleRef,
    modelId,
    "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/"
  );
  const modelList = Array.isArray(patched.appConfig?.model_list) ? patched.appConfig.model_list : [];
  const record = modelList[0] as { model_lib?: string } | undefined;
  assert.ok(record?.model_lib);
  assert.equal(
    record?.model_lib,
    "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_90/qwen2.5_3b.wasm"
  );
  assert.equal(
    patched.modelLibUrl,
    "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_90/qwen2.5_3b.wasm"
  );
});

test("patchWebLlmAppConfigForCsp keeps non-raw model_lib as-is", () => {
  const modelId = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
  const cdnUrl =
    "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_90/qwen2.5_3b.wasm";
  const moduleRef = {
    prebuiltAppConfig: {
      model_list: [
        {
          model_id: modelId,
          model_lib: cdnUrl,
        },
      ],
    },
  };

  const patched = patchWebLlmAppConfigForCsp(
    moduleRef,
    modelId,
    "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/"
  );
  const modelList = Array.isArray(patched.appConfig?.model_list) ? patched.appConfig.model_list : [];
  const record = modelList[0] as { model_lib?: string } | undefined;
  assert.equal(record?.model_lib, cdnUrl);
  assert.equal(patched.modelLibUrl, cdnUrl);
});
