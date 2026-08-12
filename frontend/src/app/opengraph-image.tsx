import { ImageResponse } from "next/og";

// output: "export" ile route'un derleme anında üretilmesi gerekir.
export const dynamic = "force-static";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Actuarius — Aktüeryal rezerv ve IBNR analiz platformu";

/** Paylaşım kartı görseli. Build sırasında üretilir (statik export uyumlu). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4f3ef",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              background: "#a85a33",
              clipPath: "polygon(0 0, 100% 0, 0 100%)",
            }}
          />
          <div style={{ fontSize: 30, fontWeight: 800, color: "#191b20", letterSpacing: -1 }}>
            Actuarius
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: "#191b20",
              lineHeight: 1.05,
              letterSpacing: -2.5,
            }}
          >
            Aktüeryal işin tamamı,
          </div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: "#a85a33",
              lineHeight: 1.05,
              letterSpacing: -2.5,
            }}
          >
            tek platformda.
          </div>
          <div style={{ fontSize: 27, color: "#5d6472", marginTop: 22, lineHeight: 1.4 }}>
            Veri · Rezerv · Nakit Akışı · İskonto — ve hepsini yürüten bir AI Agent
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {["Chain-Ladder", "Bornhuetter–Ferguson", "IFRS 17", "actuarius.com.tr"].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 20,
                color: "#5d6472",
                background: "#ffffff",
                border: "1px solid #e5e2db",
                borderRadius: 999,
                padding: "9px 20px",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
