import { useId } from "react";

/** An illustrative development triangle, not a representation of client data. */
export function DevelopmentSculpture({ locale }: { locale: "tr" | "en" }) {
  const id = useId();
  const en = locale === "en";
  const cells = Array.from({ length: 49 }, (_, i) => ({ row: Math.floor(i / 7), col: i % 7 }))
    .sort((a, b) => a.row + a.col - b.row - b.col);
  return (
    <svg viewBox="0 0 620 490" fill="none" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>{en ? "From observed data to projected development" : "Gözlenen veriden gelişim projeksiyonuna"}</title>
      <desc id={`${id}-desc`}>{en ? "A sculptural development triangle. Blue observed cells connect to a pale projected triangle." : "Üç boyutlu gelişim üçgeni. Mavi gözlenen hücreler, açık renkli projeksiyon üçgenine bağlanıyor."}</desc>
      <g stroke="#dfe7f1" strokeWidth=".8">
        {Array.from({ length: 10 }, (_, i) => <path key={`a${i}`} d={`M ${45 + i * 38} ${249 - i * 21} l 304 168`} />)}
        {Array.from({ length: 10 }, (_, i) => <path key={`b${i}`} d={`M ${235 + i * 38} ${123 + i * 21} l -304 168`} />)}
      </g>
      {cells.map(({ row, col }) => {
        const observed = row + col <= 6;
        const ridge = row + col === 6;
        const x = 310 + (col - row) * 36;
        const floor = 150 + (col + row) * 21;
        const height = observed ? 26 + (6 - row - col) * 11 : 4;
        const y = floor - height;
        const top = ridge ? "#175cd3" : observed ? ["#2c6bd7", "#4d84df", "#6c9ae7", "#89aeed", "#a4c0f1", "#c2d5f5"][Math.min(row + col, 5)] : "#f4f8fe";
        return <g key={`${row}-${col}`}>
          <path d={`M${x - 33} ${y + 19} L${x} ${y + 38} V${floor + 38} L${x - 33} ${floor + 19} Z`} fill={observed ? "#82a9e8" : "#e0eafa"} />
          <path d={`M${x + 33} ${y + 19} L${x} ${y + 38} V${floor + 38} L${x + 33} ${floor + 19} Z`} fill={ridge ? "#164aa3" : observed ? "#5484cc" : "#cfdef3"} />
          <path d={`M${x} ${y} L${x + 33} ${y + 19} L${x} ${y + 38} L${x - 33} ${y + 19} Z`} fill={top} stroke={observed ? "#ffffff" : "#c5d6ec"} strokeWidth={observed ? ".5" : ".8"} strokeDasharray={observed ? undefined : "3 3"} />
          {ridge && <circle cx={x} cy={y + 19} r="2" fill="white" />}
        </g>;
      })}
      <g fontFamily="inherit" fontSize="12" fill="#52657a">
        <path d="M142 181H78V142" stroke="#8097b8" fill="none" />
        <circle cx="142" cy="181" r="3" fill="#175cd3" />
        <text x="45" y="125">{en ? "Observed data" : "Gözlenen veri"}</text>
        <path d="M454 351H537V391" stroke="#8097b8" strokeDasharray="3 3" fill="none" />
        <circle cx="454" cy="351" r="3" fill="#8097b8" />
        <text x="496" y="413">{en ? "Projection" : "Projeksiyon"}</text>
      </g>
      <g transform="translate(236 435)">
        <path d="M0 0H147" stroke="#a0b4cf" />
        <path d="m141 -4 7 4-7 4" stroke="#a0b4cf" />
        <text x="74" y="22" textAnchor="middle" fill="#52657a" fontFamily="inherit" fontSize="11">{en ? "Development over time" : "Zaman içinde gelişim"}</text>
      </g>
    </svg>
  );
}
