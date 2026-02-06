import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "RNest app preview";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: 36,
          background:
            "linear-gradient(135deg, #eaf3ff 0%, #f3f7ff 38%, #ffffff 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            borderRadius: 34,
            background: "white",
            border: "1px solid #e7ebf2",
            boxShadow: "0 16px 42px rgba(11,22,44,0.08)",
            padding: 46,
            gap: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#0B1E52",
                    color: "white",
                    fontSize: 18,
                    fontWeight: 800,
                  }}
                >
                  RN
                </div>
                <div
                  style={{
                    display: "flex",
                    color: "#101828",
                    fontSize: 34,
                    fontWeight: 800,
                    letterSpacing: -0.8,
                  }}
                >
                  RNest
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  color: "#111827",
                  fontSize: 55,
                  fontWeight: 800,
                  lineHeight: 1.08,
                  letterSpacing: -1.2,
                  maxWidth: 620,
                }}
              >
                Personal recovery guidance for shift workers
              </div>

              <div
                style={{
                  display: "flex",
                  color: "#4b5565",
                  fontSize: 26,
                  lineHeight: 1.35,
                  maxWidth: 640,
                }}
              >
                RNest analyzes health logs, shift schedules, and cycle patterns to
                recommend what to do today for faster recovery.
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <span
                  style={{
                    display: "flex",
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "1px solid #c7d7ff",
                    color: "#1d4ed8",
                    fontSize: 20,
                    fontWeight: 700,
                    background: "#f4f8ff",
                  }}
                >
                  AI Recovery
                </span>
                <span
                  style={{
                    display: "flex",
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "1px solid #c7d7ff",
                    color: "#1d4ed8",
                    fontSize: 20,
                    fontWeight: 700,
                    background: "#f4f8ff",
                  }}
                >
                  Shift-aware
                </span>
                <span
                  style={{
                    display: "flex",
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "1px solid #c7d7ff",
                    color: "#1d4ed8",
                    fontSize: 20,
                    fontWeight: 700,
                    background: "#f4f8ff",
                  }}
                >
                  Cycle-aware
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  color: "#64748b",
                  fontSize: 22,
                  fontWeight: 600,
                }}
              >
                rnest.kr
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: 360,
              borderRadius: 34,
              border: "1px solid #e9edf5",
              background:
                "linear-gradient(180deg, rgba(0,122,255,0.09) 0%, rgba(255,255,255,0.98) 46%)",
              padding: 22,
            }}
          >
            <div style={{ display: "flex", width: "100%", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", color: "#5b6374", fontSize: 16, fontWeight: 700 }}>
                Today&apos;s recovery summary
              </div>
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  borderRadius: 22,
                  border: "1px solid #e8edf5",
                  background: "white",
                  padding: 16,
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", color: "#9aa3b2", fontSize: 14, fontWeight: 700 }}>
                    Vital
                  </div>
                  <div style={{ display: "flex", color: "#0f172a", fontSize: 36, fontWeight: 800 }}>
                    63
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    width: "100%",
                    height: 12,
                    borderRadius: 999,
                    background: "#eef2f9",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "63%",
                      height: "100%",
                      borderRadius: 999,
                      background: "#007AFF",
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      display: "flex",
                      color: "#1d4ed8",
                      fontSize: 13,
                      fontWeight: 700,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid #c7d7ff",
                    }}
                  >
                    Sleep debt
                  </span>
                  <span
                    style={{
                      display: "flex",
                      color: "#1d4ed8",
                      fontSize: 13,
                      fontWeight: 700,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid #c7d7ff",
                    }}
                  >
                    Rhythm
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  width: "100%",
                  borderRadius: 22,
                  border: "1px solid #e8edf5",
                  background: "white",
                  padding: 16,
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", color: "#5b6374", fontSize: 14, fontWeight: 700 }}>
                  7-day trend
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 56 }}>
                  {[48, 42, 58, 52, 64, 69, 63].map((h, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        width: 12,
                        height: h,
                        borderRadius: 999,
                        background: idx > 4 ? "#007AFF" : "#b9ccff",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
