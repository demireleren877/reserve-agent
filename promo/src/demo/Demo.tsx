// Actuarius Enterprise — Agent demo: Fire Home Q3 kapanışı (90 sn, 1080p60).
//
// Her şey sohbet panelinin içinde akar. Öğelerin yükseklikleri bir kez ölçülür
// (gizli kopya), böylece kaydırma ve imleç konumları her karede deterministiktir.
import React, { useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { LARGE_FILE, LARGE_SHARE, LR_BASIS, PRIOR_LR, Q3_IBNR, TAIL, fmt } from "./data";
import {
  AgentText,
  AskCard,
  BfTableCard,
  C,
  ClaimsMessageCard,
  ClaimsReply,
  I,
  Icon,
  LdfTriangleCard,
  ResultCard,
  SANS,
  SavedLine,
  Spark,
  Suggestions,
  TailCard,
  ToolStep,
  TriangleCard,
  Typing,
  UserBubble,
  ease,
  type HistoryMode,
} from "./ui";

export const DEMO_FPS = 60;
export const DEMO_SECONDS = 90;
export const DEMO_DURATION = DEMO_FPS * DEMO_SECONDS;

const PANEL_W = 720;
const PANEL_H = 700;
const SCALE = 1.45;
const HEADER_H = 56;
const CONTEXT_H = 32;
const COMPOSER_H = 76;
const VIEW_H = PANEL_H - HEADER_H - CONTEXT_H - COMPOSER_H;
const GAP = 12;
const PAD = 16;

// ─── Zaman çizelgesi (sn) ─────────────────────────────────────────────────────
const PROMPT = "Close Q3 for Fire Home. Roll forward from Q2, review the factors and give me the reserve summary.";
const TYPE_START = 0.9;
const TYPE_CPS = 30;
const SEND = TYPE_START + PROMPT.length / TYPE_CPS + 0.4;
const ASK_AT = 24.0;
const YES_CLICK = 26.4; // mutlak
const REPLY_AT = 40.0;

type Item = { at: number; until?: number; node: (t: number) => React.ReactNode; key: string };
const step = (key: string, at: number, name: string, args: string | undefined, dur: number, first = false): Item => ({
  key,
  at,
  node: (t) => <ToolStep name={name} args={args} t={t} dur={dur} first={first} />,
});

let HISTORY: HistoryMode = "chart";
const BASIS = `vw(${LR_BASIS[0]}:${LR_BASIS[LR_BASIS.length - 1]})`;
const LR_TXT = `${(PRIOR_LR * 100).toFixed(1)}%`;

const ITEMS: Item[] = [
  { key: "u1", at: SEND + 0.1, node: (t) => <UserBubble text={PROMPT} t={t} /> },
  { key: "typing1", at: SEND + 0.5, until: SEND + 1.3, node: (t) => <Typing t={t} /> },
  step("s1", SEND + 1.3, "list_data_periods", "Fire Home", 0.6, true),
  step("s2", SEND + 2.0, "roll_forward", "2026Q2 → 2026Q3", 1.2),
  { key: "tri", at: SEND + 3.4, node: (t) => <TriangleCard t={t} /> },
  {
    key: "a1",
    at: 14.0,
    node: (t) => <AgentText t={t} text="Rolled forward to **2026Q3**: 10 new cells on the latest diagonal. Checking them against the development factors…" />,
  },
  step("s3", 15.4, "get_analysis_state", "ldf · incurred", 0.7),
  step("s4", 16.2, "get_file_summary", "AY2023 · 2026Q3", 0.8),
  { key: "ldf", at: 17.2, node: (t) => <LdfTriangleCard t={t} mode="review" /> },
  {
    key: "a2",
    at: 20.8,
    node: (t) => (
      <AgentText
        t={t}
        text={`Nearly all of that jump (${Math.round(LARGE_SHARE * 100)}%) comes from a single file: **${LARGE_FILE}**, incurred **18.6m**, booked in 2026Q3. The data doesn't tell me why.\n\nWant me to ask the claims team about this file?`}
      />
    ),
  },
  { key: "ask", at: ASK_AT, node: (t) => <AskCard t={t} clickAt={YES_CLICK - ASK_AT} /> },
  { key: "u2", at: YES_CLICK + 0.35, node: (t) => <UserBubble text="Yes, ask them." t={t} /> },
  step("s5", YES_CLICK + 0.9, "ask_claims_team", LARGE_FILE, 0.9, true),
  { key: "msg", at: YES_CLICK + 2.0, node: (t) => <ClaimsMessageCard t={t} repliedAt={REPLY_AT - (YES_CLICK + 2.0)} /> },
  { key: "a3", at: 31.4, node: (t) => <AgentText t={t} text="Sent. I'll carry on with the rest of the model meanwhile." /> },
  step("s6", 32.4, "set_method", "volume_weighted", 0.5),
  step("s7", 33.0, "set_window", "8 accident years", 0.5),
  step("s8", 33.6, "set_curve_model", "inverse_power", 0.9),
  { key: "tail", at: 34.7, node: (t) => <TailCard t={t} /> },
  { key: "reply", at: REPLY_AT, node: (t) => <ClaimsReply t={t} /> },
  {
    key: "a4",
    at: 43.2,
    node: (t) => (
      <AgentText
        t={t}
        avatar
        text="Confirmed as a one-off with no further development. I'll exclude that cell from the factor selection so it doesn't drive the projection of the younger years."
      />
    ),
  },
  step("s9", 45.6, "exclude_cells", "AY2023 · 14→15", 0.6),
  { key: "ldf2", at: 46.5, node: (t) => <LdfTriangleCard t={t} mode="excluded" /> },
  step("s10", 51.6, "set_basis", "BF · AY2026", 0.5),
  step("s11", 52.2, "simulate_bf", `prior ${BASIS}`, 0.8),
  {
    key: "a5",
    at: 53.2,
    node: (t) => (
      <AgentText
        t={t}
        text={`AY2026 has only 3 quarters of development, so I'm using Bornhuetter–Ferguson for it. The prior loss ratio is **${BASIS}**: the premium-weighted pattern ratio of AY${LR_BASIS[0]}–${LR_BASIS[LR_BASIS.length - 1]}, **${LR_TXT}**.`}
      />
    ),
  },
  { key: "bf", at: 55.6, node: (t) => <BfTableCard t={t} /> },
  step("s12", 61.6, "run_chain_ladder", "all accident years", 1.1),
  { key: "res", at: 62.9, node: (t) => <ResultCard t={t} history={HISTORY} /> },
  {
    key: "a6",
    at: 69.6,
    node: (t) => (
      <AgentText
        t={t}
        wps={22}
        text={`**Q3 close is ready for your review.**\n• Rolled forward to 2026Q3\n• AY2023 · 14→15 excluded from the factors (one-off total loss, confirmed by claims)\n• Volume-weighted, 8 AYs · inverse-power tail ${TAIL.toFixed(3)}\n• BF for AY2026, prior ${BASIS} = ${LR_TXT}\n• IBNR **${fmt(Q3_IBNR)}m TRY**`}
      />
    ),
  },
  step("s13", 74.4, "create_version", "Q3 close · v1", 0.7),
  { key: "saved", at: 75.3, node: (t) => <SavedLine t={t} steps={13} /> },
  { key: "sugg", at: 76.2, node: (t) => <Suggestions t={t} /> },
];

// Bölüm rayı (sol): demo izleyicisine nerede olduğumuzu söyler.
const CHAPTERS: { at: number; label: string }[] = [
  { at: 0, label: "Request" },
  { at: SEND + 1.3, label: "Roll forward" },
  { at: 15.4, label: "Review factors" },
  { at: ASK_AT, label: "Ask the claims team" },
  { at: 32.4, label: "Method & tail" },
  { at: REPLY_AT, label: "Exclude the outlier" },
  { at: 51.6, label: "Bornhuetter–Ferguson" },
  { at: 61.6, label: "Reserve summary" },
  { at: 74.4, label: "Save & audit" },
];

// Kamera: [sn, ölçek, dikey kayma(px)]
const CAM: [number, number, number][] = [
  [0, 1.0, 0],
  [5, 1.0, 0],
  [8, 1.06, -40],
  [13.5, 1.06, -40],
  [17, 1.1, -70],
  [23, 1.1, -70],
  [25.5, 1.12, -110],
  [28, 1.12, -110],
  [30, 1.06, -50],
  [37, 1.08, -60],
  [40.5, 1.12, -100],
  [44, 1.06, -50],
  [47.5, 1.1, -80],
  [51, 1.1, -80],
  [55.5, 1.08, -60],
  [60.5, 1.08, -60],
  [63.5, 1.1, -60],
  [68.5, 1.1, -60],
  [71.5, 1.04, -20],
  [78, 1.0, 0],
  [90, 1.0, 0],
];

function cam(s: number) {
  let i = 0;
  while (i < CAM.length - 2 && CAM[i + 1][0] <= s) i++;
  const [t0, s0, y0] = CAM[i];
  const [t1, s1, y1] = CAM[i + 1];
  const k = interpolate(s, [t0, t1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.45, 0, 0.2, 1),
  });
  return { scale: s0 + (s1 - s0) * k, y: y0 + (y1 - y0) * k };
}

// ─── Fontlar ──────────────────────────────────────────────────────────────────
const fontCss = `
@font-face { font-family: 'Geist'; src: url('${staticFile("fonts/geist-latin.woff2")}') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Geist Mono'; src: url('${staticFile("fonts/geist-mono-latin.woff2")}') format('woff2'); font-weight: 100 900; }
`;

// ─── Panel parçaları ──────────────────────────────────────────────────────────
const HeaderBtn: React.FC<{ d: string }> = ({ d }) => (
  <div style={{ width: 28, height: 28, borderRadius: 6, display: "grid", placeItems: "center", color: C.muted }}>
    <Icon d={d} />
  </div>
);

const Header: React.FC = () => (
  <div style={{ height: HEADER_H, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: `1px solid ${C.border}` }}>
    <div style={{ width: 28, height: 28, borderRadius: 8, background: C.primary, color: "#fff", display: "grid", placeItems: "center" }}>
      <Spark size={15} />
    </div>
    <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>Actuarius</span>
    <span style={{ fontSize: 11, color: C.muted, padding: "2px 8px", borderRadius: 999, background: C.alt, border: `1px solid ${C.border}` }}>Agent</span>
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
      <HeaderBtn d={I.history} />
      <HeaderBtn d={I.plus} />
      <HeaderBtn d={I.gear} />
      <div style={{ width: 1, height: 16, background: C.border, margin: "0 2px" }} />
      <HeaderBtn d={I.close} />
    </div>
  </div>
);

const ContextBar: React.FC<{ s: number }> = ({ s }) => {
  const flip = SEND + 3.2;
  const q3 = s >= flip;
  const flash = q3 ? 1 - ease(s, flip, flip + 1.2) : 0;
  return (
    <div style={{ height: CONTEXT_H, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", background: C.alt, borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.mutedStrong }}>
      <span style={{ fontWeight: 600, color: C.fg }}>FIRE HOME</span>
      <span style={{ color: C.borderStrong }}>·</span>
      <span style={{ padding: "1px 6px", borderRadius: 4, background: `rgba(29,78,216,${0.15 * flash})`, color: flash > 0.05 ? C.primary : C.mutedStrong, fontWeight: flash > 0.05 ? 600 : 400 }}>
        {q3 ? "2026Q3" : "2026Q2"}
      </span>
      <span style={{ color: C.borderStrong }}>·</span>
      <span>Yearly AY · quarterly development</span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>Incurred</span>
    </div>
  );
};

const Composer: React.FC<{ s: number }> = ({ s }) => {
  const typed = s < SEND ? Math.floor(Math.max(0, s - TYPE_START) * TYPE_CPS) : 0;
  const text = PROMPT.slice(0, Math.min(typed, PROMPT.length));
  const caret = Math.floor(s * 2) % 2 === 0;
  const press = ease(s, SEND - 0.12, SEND) * (1 - ease(s, SEND, SEND + 0.2));
  return (
    <div style={{ height: COMPOSER_H, borderTop: `1px solid ${C.border}`, padding: 12, background: C.surface }}>
      <div style={{ height: 52, display: "flex", alignItems: "center", gap: 8, padding: "0 8px 0 14px", borderRadius: 12, border: `1px solid ${text ? C.primaryBorder : C.border}`, background: C.surface, boxShadow: text ? "0 0 0 3px rgba(29,78,216,.08)" : undefined }}>
        <div style={{ flex: 1, fontSize: 14, color: text ? C.fg : C.muted, whiteSpace: "nowrap", overflow: "hidden", display: "flex", justifyContent: text.length > 70 ? "flex-end" : "flex-start" }}>
          <span>
            {text || "Ask Actuarius…"}
            {s < SEND && s > 0.4 && <span style={{ display: "inline-block", width: 1.5, height: 17, background: caret ? C.fg : "transparent", marginLeft: 1, verticalAlign: -3 }} />}
          </span>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: text ? C.primary : C.alt, color: text ? "#fff" : C.muted, display: "grid", placeItems: "center", transform: `scale(${1 - 0.08 * press})` }}>
          <Icon d={I.send} size={15} />
        </div>
      </div>
    </div>
  );
};

/** İmleç (panel koordinatları). */
const Pointer: React.FC<{ x: number; y: number; click: number; o: number }> = ({ x, y, click, o }) => (
  <div style={{ position: "absolute", left: x, top: y, opacity: o, pointerEvents: "none", zIndex: 30 }}>
    {click > 0 && (
      <div style={{ position: "absolute", left: -18, top: -18, width: 36, height: 36, borderRadius: 18, border: `2px solid ${C.primary}`, opacity: 1 - click, transform: `scale(${0.4 + click})` }} />
    )}
    <svg width={22} height={22} viewBox="0 0 24 24" style={{ position: "absolute", left: -3, top: -2, filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))" }}>
      <path d="M4 2l16 9.5-7 1.6L9.6 20z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  </div>
);

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export const AgentDemo: React.FC<{ history?: HistoryMode }> = ({ history = "chart" }) => {
  HISTORY = history;
  const frame = useCurrentFrame();
  const s = frame / DEMO_FPS;

  // Ölçüm: her öğenin yerleşik yüksekliği + "yes" butonunun konumu.
  const [layout, setLayout] = useState<{ h: number[]; yes: { x: number; y: number } } | null>(null);
  const [handle] = useState(() => delayRender("demo-measure"));
  const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
  useLayoutEffect(() => {
    let alive = true;
    document.fonts.load("500 14px Geist").then(() => document.fonts.load("500 12px 'Geist Mono'")).then(() => document.fonts.ready).then(() => {
      if (!alive) return;
      const h = measureRefs.current.map((r) => r?.offsetHeight ?? 0);
      const askIdx = ITEMS.findIndex((it) => it.key === "ask");
      const box = measureRefs.current[askIdx];
      const btn = box?.querySelector("[data-anchor=yes]") as HTMLElement | null;
      const br = btn?.getBoundingClientRect();
      const bb = box?.getBoundingClientRect();
      setLayout({ h, yes: { x: br && bb ? br.left - bb.left + br.width * 0.55 : 120, y: br && bb ? br.top - bb.top + br.height * 0.6 : 16 } });
      continueRender(handle);
    });
    return () => {
      alive = false;
    };
  }, [handle]);

  const feedW = PANEL_W - PAD * 2;

  // Görünür öğeler ve kaydırma
  const grow = (it: Item) => {
    const t = s - it.at;
    if (t < 0) return 0;
    if (it.until !== undefined) {
      if (s >= it.until) return 1 - ease(s, it.until, it.until + 0.2);
    }
    return ease(t, 0, 0.45);
  };
  const tops: number[] = [];
  let y = PAD;
  ITEMS.forEach((it, i) => {
    tops.push(y);
    const g = grow(it);
    const h = layout ? layout.h[i] : 0;
    y += (h + GAP) * g;
  });
  const contentH = y + PAD - GAP;
  const scroll = Math.max(0, contentH - VIEW_H);

  // İmleç: send → (gizle) → "Yes" butonu
  const askIdx = ITEMS.findIndex((it) => it.key === "ask");
  const yesY = HEADER_H + CONTEXT_H + (tops[askIdx] ?? 0) - scroll + (layout?.yes.y ?? 0);
  const yesX = PAD + 32 + (layout?.yes.x ?? 0);
  const sendX = PANEL_W - 12 - 8 - 18;
  const sendY = PANEL_H - COMPOSER_H + 12 + 26;
  let px = sendX + 160;
  let py = sendY + 120;
  let po = 0;
  let click = 0;
  if (s < SEND + 1.2) {
    const k = ease(s, SEND - 1.4, SEND - 0.15);
    px = sendX + 160 * (1 - k);
    py = sendY + 120 * (1 - k);
    po = ease(s, SEND - 1.6, SEND - 1.2) * (1 - ease(s, SEND + 0.6, SEND + 1.1));
    click = s > SEND && s < SEND + 0.45 ? (s - SEND) / 0.45 : 0;
  } else if (s > YES_CLICK - 2.2 && s < YES_CLICK + 1.4) {
    const k = ease(s, YES_CLICK - 1.6, YES_CLICK - 0.12);
    px = yesX + 180 * (1 - k);
    py = yesY + 140 * (1 - k);
    po = ease(s, YES_CLICK - 2.0, YES_CLICK - 1.6) * (1 - ease(s, YES_CLICK + 0.7, YES_CLICK + 1.3));
    click = s > YES_CLICK && s < YES_CLICK + 0.45 ? (s - YES_CLICK) / 0.45 : 0;
  }

  const { scale: cs, y: cy } = cam(s);
  const intro = ease(s, 0, 0.8);
  const outro = ease(s, 84.5, 86.5);

  // Bölüm rayı
  let chap = 0;
  CHAPTERS.forEach((c, i) => {
    if (s >= c.at) chap = i;
  });

  return (
    <AbsoluteFill style={{ background: "#e9edf3", fontFamily: SANS, color: C.fg }}>
      <style>{fontCss}</style>
      {/* Arka plan: yumuşak ışık */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(1200px 700px at 50% 40%, #f8fafc 0%, #eef2f7 55%, #e3e8f0 100%), linear-gradient(180deg,#eef2f7,#e5eaf1)",
        }}
      />
      <AbsoluteFill style={{ opacity: 0.5, backgroundImage: "radial-gradient(rgba(15,23,42,.06) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

      {/* Ölçüm kopyası (görünmez) */}
      <div style={{ position: "absolute", left: -10000, top: 0, width: feedW, visibility: "hidden" }}>
        {ITEMS.map((it, i) => (
          <div key={it.key} ref={(el) => { measureRefs.current[i] = el; }}>
            {it.node(999)}
          </div>
        ))}
      </div>

      {/* Bölüm rayı */}
      <div style={{ position: "absolute", left: 86, top: 300, width: 300, opacity: intro * (1 - outro) }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 18 }}>
          Fire Home · Q3 close
        </div>
        {CHAPTERS.map((c, i) => {
          const active = i === chap;
          const done = i < chap;
          return (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 14, height: 40 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  background: active ? C.primary : done ? C.successSoft : "transparent",
                  color: active ? "#fff" : done ? C.success : C.muted,
                  border: `1.5px solid ${active ? C.primary : done ? "#86efac" : C.borderStrong}`,
                }}
              >
                {done ? <Icon d={I.check} size={11} sw={3} /> : i + 1}
              </div>
              <span style={{ fontSize: 19, fontWeight: active ? 600 : 400, color: active ? C.fg : done ? C.mutedStrong : C.muted }}>{c.label}</span>
            </div>
          );
        })}
      </div>

      {/* Sağ alt: veri notu */}
      <div style={{ position: "absolute", left: 86, bottom: 60, fontSize: 15, color: C.muted, opacity: intro * (1 - outro), lineHeight: 1.6 }}>
        Actuarius Enterprise · Agent
        <br />
        <span style={{ fontSize: 13 }}>Sample data · amounts in TRY</span>
      </div>

      {/* Panel + kamera */}
      <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
        <div
          style={{
            width: PANEL_W,
            height: PANEL_H,
            transform: `translate(${120}px, ${cy}px) scale(${SCALE * cs * (0.97 + 0.03 * intro)})`,
            opacity: intro * (1 - outro),
          }}
        >
          <div
            style={{
              position: "relative",
              width: PANEL_W,
              height: PANEL_H,
              background: C.surface,
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              boxShadow: "0 30px 80px -30px rgba(15,23,42,.35), 0 8px 24px -12px rgba(15,23,42,.18)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Header />
            <ContextBar s={s} />
            <div style={{ position: "relative", height: VIEW_H, overflow: "hidden", background: C.surface }}>
              {/* Boş durum */}
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, opacity: 1 - ease(s, SEND - 0.1, SEND + 0.3) }}>
                <div style={{ width: 44, height: 44, borderRadius: 16, background: C.primary, color: "#fff", display: "grid", placeItems: "center" }}>
                  <Spark size={22} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>How can I help?</div>
                <div style={{ fontSize: 12, color: C.muted }}>Ask about reserve analysis, IBNR, LDF/BF settings and scenarios.</div>
              </div>
              <div style={{ position: "absolute", left: PAD, right: PAD, top: 0, transform: `translateY(${-scroll}px)` }}>
                {layout &&
                  ITEMS.map((it, i) => {
                    const g = grow(it);
                    if (g <= 0.001) return null;
                    return (
                      <div key={it.key} style={{ position: "absolute", left: 0, width: feedW, top: tops[i], opacity: it.until !== undefined ? g : 1 }}>
                        {it.node(s - it.at)}
                      </div>
                    );
                  })}
              </div>
              {/* üst/alt yumuşak kenar */}
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 18, background: "linear-gradient(#fff, rgba(255,255,255,0))", opacity: scroll > 4 ? 1 : 0 }} />
            </div>
            <Composer s={s} />
            <Pointer x={px} y={py} click={click} o={po} />
          </div>
        </div>
      </AbsoluteFill>

      {/* Kapanış */}
      <AbsoluteFill style={{ display: "grid", placeItems: "center", opacity: ease(s, 86, 87.4) }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: C.primary, color: "#fff", display: "grid", placeItems: "center" }}>
              <Spark size={32} />
            </div>
            <span style={{ fontSize: 46, fontWeight: 650, letterSpacing: -1 }}>Actuarius</span>
          </div>
          <div style={{ marginTop: 16, fontSize: 20, color: C.mutedStrong }}>Enterprise · AI Agent for reserving</div>
          <div style={{ marginTop: 8, fontSize: 15, color: C.muted }}>actuarius.com.tr</div>
        </div>
      </AbsoluteFill>

      <Audio src={staticFile("demo-score.m4a")} />
    </AbsoluteFill>
  );
};

