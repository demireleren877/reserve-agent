import React from "react";
import { useCurrentFrame } from "remotion";
import { FONT_DISPLAY, FONT_MONO, K } from "./theme";
import { clamp, easeInExpo, easeOutExpo, prog } from "./math";

const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

// ─── Kinetik tipografi ─────────────────────────────────────────────
// Metin hiçbir zaman düz "fade" ile gelmez: kelimeler maskeden yükselir,
// harfler bulanıklıktan netleşir, parlak bir ışık hüzmesi yüzeyden geçer.

type Common = {
  /** Sahne-içi başlangıç karesi */
  at: number;
  /** Çıkış karesi (yoksa kalır) */
  out?: number;
  style?: React.CSSProperties;
};

const sheen = (f: number, at: number): React.CSSProperties => {
  // Metnin üzerinden geçen metalik ışık hüzmesi
  const p = clamp((f - at - 6) / 40);
  const x = -60 + p * 220;
  return {
    backgroundImage: `linear-gradient(100deg, rgba(245,245,247,0.78) ${x - 30}%, #ffffff ${x}%, rgba(245,245,247,0.78) ${x + 30}%)`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
};

/** Kelimeler maskenin altından yükselir; çıkışta yukarı süzülüp bulanıklaşır. */
export const Rise: React.FC<
  Common & { text: string; size?: number; weight?: number; stagger?: number; gradient?: string; shine?: boolean; tracking?: number }
> = ({ text, at, out, size = 96, weight = 650, stagger = 3, style, gradient, shine = true, tracking = -0.035 }) => {
  const f = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: `${tracking}em`,
        lineHeight: 1.04,
        color: K.ink,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: `0 ${size * 0.26}px`,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const pin = easeOutExpo(prog(f, at + i * stagger, at + i * stagger + 26));
        const pout = out === undefined ? 0 : easeInExpo(prog(f, out + i * 1.5, out + i * 1.5 + 14));
        const y = (1 - pin) * 105 - pout * 60;
        const blur = (1 - pin) * 10 + pout * 14;
        const paint: React.CSSProperties = gradient
          ? { backgroundImage: gradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
          : shine
            ? sheen(f, at + i * stagger)
            : {};
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", padding: "0.06em 0.02em 0.12em", margin: "-0.06em -0.02em -0.12em" }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${y}%)`,
                filter: `blur(${blur}px)`,
                opacity: 1 - pout,
                ...paint,
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Harf harf bulanıklıktan netleşme + tracking daralması. */
export const Focus: React.FC<Common & { text: string; size?: number; weight?: number; color?: string; tracking?: number; spread?: number }> = ({
  text,
  at,
  out,
  size = 40,
  weight = 500,
  color = K.inkSoft,
  tracking = 0,
  spread = 0.9,
  style,
}) => {
  const f = useCurrentFrame();
  const chars = [...text];
  const pAll = easeOutExpo(prog(f, at, at + 40));
  const pout = out === undefined ? 0 : easeInExpo(prog(f, out, out + 12));
  return (
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        fontWeight: weight,
        color,
        letterSpacing: `${tracking + (1 - pAll) * spread * 0.3}em`,
        whiteSpace: "pre",
        opacity: 1 - pout,
        filter: pout ? `blur(${pout * 12}px)` : undefined,
        ...style,
      }}
    >
      {chars.map((c, i) => {
        const p = easeOutExpo(prog(f, at + i * 0.9, at + i * 0.9 + 18));
        return (
          <span key={i} style={{ opacity: p, filter: `blur(${(1 - p) * 8}px)`, display: "inline-block", whiteSpace: "pre" }}>
            {c}
          </span>
        );
      })}
    </div>
  );
};

/** Küçük, geniş aralıklı üst etiket + çizilen ince çizgi. */
export const Kicker: React.FC<Common & { text: string; color?: string }> = ({ text, at, out, color = K.indigoGlow, style }) => {
  const f = useCurrentFrame();
  const p = easeOutExpo(prog(f, at, at + 30));
  const pout = out === undefined ? 0 : easeInExpo(prog(f, out, out + 12));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: 1 - pout, ...style }}>
      <div style={{ width: 56 * p, height: 2, background: color, boxShadow: `0 0 12px ${color}` }} />
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: `${0.34 + (1 - p) * 0.4}em`,
          textTransform: "uppercase",
          color,
          opacity: p,
          filter: `blur(${(1 - p) * 6}px)`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Mekanik rakam şeridi — her hane kendi silindirinde döner. */
export const Odometer: React.FC<{
  value: number;
  at: number;
  dur?: number;
  size?: number;
  decimals?: number;
  color?: string;
  prefix?: string;
  suffix?: string;
  style?: React.CSSProperties;
}> = ({ value, at, dur = 50, size = 200, decimals = 0, color = K.ink, prefix = "", suffix = "", style }) => {
  const f = useCurrentFrame();
  const str = value.toLocaleString("tr-TR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const digits = [...str];
  let di = 0;
  const nDigits = digits.filter((c) => /\d/.test(c)).length;
  return (
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: "-0.045em",
        fontVariantNumeric: "tabular-nums",
        color,
        display: "flex",
        lineHeight: 1,
        ...style,
      }}
    >
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          {[1, 2, 3, 4, 5, 6].map((l) => (
            <filter key={l} id={`odo-mb-${l}`} x="-10%" y="-60%" width="120%" height="220%">
              <feGaussianBlur stdDeviation={`${l * 0.4} ${l * 5}`} />
            </filter>
          ))}
        </defs>
      </svg>
      {prefix ? <span>{prefix}</span> : null}
      {digits.map((c, i) => {
        if (!/\d/.test(c)) {
          const p = easeOutExpo(prog(f, at + 10, at + 30));
          return (
            <span key={i} style={{ opacity: p }}>
              {c}
            </span>
          );
        }
        const idx = di++;
        // Yüksek basamaklar önce oturur; düşükler daha uzun döner.
        const local = prog(f, at + idx * 2, at + dur + (idx / nDigits) * 26);
        const e = easeOutQuint(local);
        const target = Number(c) + 10 * (3 + (nDigits - idx));
        const pos = e * target;
        // Dikey hareket bulanıklığı: SVG filtresi, hızla orantılı kademe
        const next = easeOutQuint(prog(f + 1, at + idx * 2, at + dur + (idx / nDigits) * 26)) * target;
        const speed = Math.abs(next - pos); // satır / kare
        const level = Math.min(6, Math.round(speed * 4));
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              height: "1em",
              overflow: "hidden",
              position: "relative",
              width: "0.62em",
              maskImage: e < 1 ? "linear-gradient(180deg, transparent 0%, #000 28%, #000 72%, transparent 100%)" : undefined,
              WebkitMaskImage: e < 1 ? "linear-gradient(180deg, transparent 0%, #000 28%, #000 72%, transparent 100%)" : undefined,
            }}
          >
            <span style={{ display: "block", transform: `translateY(${-(pos % 10)}em)`, filter: level ? `url(#odo-mb-${level})` : undefined }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, k) => (
                <span key={k} style={{ display: "block", height: "1em", textAlign: "center" }}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
      {suffix ? <span>{suffix}</span> : null}
    </div>
  );
};
