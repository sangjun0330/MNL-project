export type Shift = "D" | "E" | "N" | "M" | "OFF" | "VAC";
export type ShiftLabel = {
  id: Shift;
  name: string;
  hint: string;
  short?: string;
};

export const SHIFT_LABELS: ShiftLabel[] = [
  { id: "D", name: "Day", hint: "주간" },
  { id: "E", name: "Evening", hint: "이브닝" },
  { id: "N", name: "Night", hint: "나이트" },
  { id: "M", name: "Middle", hint: "미들" },
  { id: "OFF", name: "Off", hint: "오프" },
  { id: "VAC", name: "휴가", hint: "연차/휴가", short: "VA" },
];

export function shiftColor(shift: Shift) {
  switch (shift) {
    case "D":
      return "bg-blue-500/12 text-blue-700 border-blue-600/15";
    case "E":
      return "bg-indigo-500/12 text-indigo-700 border-indigo-600/15";
    case "N":
      return "bg-purple-500/12 text-purple-700 border-purple-600/15";
    case "M":
      return "bg-cyan-500/12 text-cyan-700 border-cyan-600/15";
    case "OFF":
      return "bg-emerald-500/12 text-emerald-700 border-emerald-600/15";
    case "VAC":
      return "bg-amber-500/14 text-amber-800 border-amber-600/15";
  }
}
