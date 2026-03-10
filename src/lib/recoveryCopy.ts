export function normalizeRecoveryCopy(text: string) {
  if (!text) return "";

  let out = text;
  const replacements: Array<[RegExp, string]> = [
    [/\bAI recovery prescriptions\b/gi, "AI recovery guides"],
    [/\bAI recovery prescription\b/gi, "AI recovery guide"],
    [/\bpersonalized recovery prescriptions\b/gi, "personalized recovery guides"],
    [/\bpersonalized recovery prescription\b/gi, "personalized recovery guide"],
    [/\brecovery prescriptions\b/gi, "recovery guides"],
    [/\brecovery prescription\b/gi, "recovery guide"],
    [/\bprescriptions\b/gi, "guides"],
    [/\bprescription\b/gi, "guide"],
    [/AI\s*맞춤\s*회복\s*처방/g, "AI 맞춤회복"],
    [/AI\s*회복\s*처방/g, "AI 회복 가이드"],
    [/맞춤\s*회복\s*처방/g, "맞춤 회복 가이드"],
    [/회복\s*처방/g, "회복 가이드"],
    [/처방처럼/g, "가이드처럼"],
    [/처방으로/g, "가이드로"],
    [/처방과/g, "가이드와"],
    [/처방을/g, "가이드를"],
    [/처방이/g, "가이드가"],
    [/처방은/g, "가이드는"],
    [/처방도/g, "가이드도"],
    [/처방만/g, "가이드만"],
    [/처방/g, "가이드"],
  ];

  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }

  return out;
}
