/**
 * Excel-benzeri mini formül motoru — BF Selected Loss Ratio için.
 *
 * Söz dizimi:
 *   - Sayı: 0.7, 75%, -0.05
 *   - Yıl referansı: 2020, 2020Q1 (sadece fonksiyon içinde kullanılır)
 *   - Aralık: 2020:2022, 2020Q1:2021Q4
 *   - Fonksiyonlar:
 *       avg(y1, y2, ...)       → pattern ratio'ların aritmetik ortalaması
 *       vw(y1, y2, ...)        → Σ CL Ultimate / Σ Exposure (volume-weighted LR)
 *       sum_cl(y1, y2, ...)    → seçili yıllar için Σ CL Ultimate
 *       sum_exp(y1, y2, ...)   → seçili yıllar için Σ Exposure
 *       pattern(y)             → tek bir origin'in pattern ratio'su
 *   - Aritmetik: +  -  *  /  ( )
 *
 * Örnekler:
 *   0.75
 *   75%
 *   avg(2020, 2021, 2022)
 *   avg(2020:2022)
 *   vw(2020:2022)
 *   vw(2020:2022) * 1.1
 *   sum_cl(2020:2022) / sum_exp(2020:2022)
 */

export interface FormulaContext {
  pattern: Map<string, number>;
  clUlt: Map<string, number>;
  exposure: Map<string, number>;
}

type Token =
  | { type: "num"; value: number }
  | { type: "ident"; name: string }
  | { type: "op"; op: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" }
  | { type: "colon" }
  | { type: "eof" };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      let dot = false;
      while (j < src.length && /[0-9.]/.test(src[j])) {
        if (src[j] === ".") {
          if (dot) break;
          dot = true;
        }
        j++;
      }
      let val = parseFloat(src.slice(i, j));
      if (src[j] === "%") {
        val /= 100;
        j++;
      }
      if (!Number.isFinite(val)) throw new Error(`Invalid number: ${src.slice(i, j)}`);
      out.push({ type: "num", value: val });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      out.push({ type: "ident", name: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    switch (c) {
      case "+":
      case "-":
      case "*":
      case "/":
        out.push({ type: "op", op: c });
        i++;
        continue;
      case "(":
        out.push({ type: "lparen" });
        i++;
        continue;
      case ")":
        out.push({ type: "rparen" });
        i++;
        continue;
      case ",":
        out.push({ type: "comma" });
        i++;
        continue;
      case ":":
        out.push({ type: "colon" });
        i++;
        continue;
      default:
        throw new Error(`Beklenmeyen karakter: "${c}"`);
    }
  }
  out.push({ type: "eof" });
  return out;
}

function refToRank(ref: string): { rank: number; quarterly: boolean } {
  const m = /^(\d{4})(?:Q([1-4]))?$/i.exec(ref);
  if (!m) throw new Error(`Invalid year: ${ref}`);
  const year = parseInt(m[1], 10);
  if (m[2]) return { rank: year * 4 + (parseInt(m[2], 10) - 1), quarterly: true };
  return { rank: year, quarterly: false };
}

function rankToRef(rank: number, quarterly: boolean): string {
  if (quarterly) {
    const year = Math.floor(rank / 4);
    const q = (rank % 4) + 1;
    return `${year}Q${q}`;
  }
  return String(rank);
}

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private ctx: FormulaContext,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private eat(): Token {
    return this.tokens[this.pos++];
  }

  parse(): number {
    const v = this.parseAdditive();
    if (this.peek().type !== "eof") {
      throw new Error("Unexpected token at end of expression");
    }
    return v;
  }

  private parseAdditive(): number {
    let left = this.parseMultiplicative();
    while (true) {
      const t = this.peek();
      if (t.type === "op" && (t.op === "+" || t.op === "-")) {
        this.eat();
        const right = this.parseMultiplicative();
        left = t.op === "+" ? left + right : left - right;
      } else break;
    }
    return left;
  }

  private parseMultiplicative(): number {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.type === "op" && (t.op === "*" || t.op === "/")) {
        this.eat();
        const right = this.parseUnary();
        if (t.op === "/") {
          if (right === 0) throw new Error("Division by zero");
          left = left / right;
        } else {
          left = left * right;
        }
      } else break;
    }
    return left;
  }

  private parseUnary(): number {
    const t = this.peek();
    if (t.type === "op" && t.op === "-") {
      this.eat();
      return -this.parseUnary();
    }
    if (t.type === "op" && t.op === "+") {
      this.eat();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.peek();
    if (t.type === "num") {
      this.eat();
      return t.value;
    }
    if (t.type === "lparen") {
      this.eat();
      const v = this.parseAdditive();
      if (this.peek().type !== "rparen") throw new Error(") bekleniyor");
      this.eat();
      return v;
    }
    if (t.type === "ident") {
      this.eat();
      if (this.peek().type !== "lparen") {
        throw new Error(`"(" expected after "${t.name}"`);
      }
      this.eat();
      const years = this.parseYearArgs();
      if (this.peek().type !== "rparen") throw new Error(") bekleniyor");
      this.eat();
      return this.callFunction(t.name, years);
    }
    throw new Error(`Beklenmeyen token: ${JSON.stringify(t)}`);
  }

  private parseYearArgs(): string[] {
    const out: string[] = [];
    if (this.peek().type === "rparen") return out;
    while (true) {
      const first = this.parseOneRef();
      if (this.peek().type === "colon") {
        this.eat();
        const second = this.parseOneRef();
        const a = refToRank(first);
        const b = refToRank(second);
        if (a.quarterly !== b.quarterly)
          throw new Error(`Range types do not match: ${first}:${second}`);
        const lo = Math.min(a.rank, b.rank);
        const hi = Math.max(a.rank, b.rank);
        for (let r = lo; r <= hi; r++) out.push(rankToRef(r, a.quarterly));
      } else {
        out.push(first);
      }
      if (this.peek().type === "comma") {
        this.eat();
      } else break;
    }
    return out;
  }

  private parseOneRef(): string {
    const t = this.eat();
    if (t.type !== "num") throw new Error("Year reference expected (e.g. 2020)");
    const year = Math.floor(t.value);
    const nt = this.peek();
    if (nt.type === "ident" && /^q[1-4]$/.test(nt.name)) {
      this.eat();
      return `${year}Q${nt.name[1]}`;
    }
    return String(year);
  }

  private callFunction(name: string, years: string[]): number {
    if (years.length === 0) throw new Error(`No year provided for ${name}()`);
    if (name === "avg" || name === "ortalama") {
      const vals: number[] = [];
      for (const y of years) {
        const v = this.ctx.pattern.get(y);
        if (v != null && Number.isFinite(v)) vals.push(v);
      }
      if (vals.length === 0) throw new Error("Pattern ratio not found");
      return vals.reduce((s, x) => s + x, 0) / vals.length;
    }
    if (name === "vw") {
      let cl = 0;
      let exp = 0;
      for (const y of years) {
        cl += this.ctx.clUlt.get(y) ?? 0;
        exp += this.ctx.exposure.get(y) ?? 0;
      }
      if (exp === 0) throw new Error("Toplam exposure 0");
      return cl / exp;
    }
    if (name === "sum_cl") {
      return years.reduce((s, y) => s + (this.ctx.clUlt.get(y) ?? 0), 0);
    }
    if (name === "sum_exp" || name === "sum_exposure") {
      return years.reduce((s, y) => s + (this.ctx.exposure.get(y) ?? 0), 0);
    }
    if (name === "pattern") {
      if (years.length !== 1) throw new Error("pattern() takes a single year");
      const v = this.ctx.pattern.get(years[0]);
      if (v == null) throw new Error(`Pattern yok: ${years[0]}`);
      return v;
    }
    throw new Error(`Bilinmeyen fonksiyon: ${name}`);
  }
}

export function evalFormula(
  expr: string,
  ctx: FormulaContext,
): { value: number | null; error: string | null } {
  const trimmed = expr.trim();
  if (!trimmed) return { value: null, error: null };
  try {
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens, ctx);
    const v = parser.parse();
    if (!Number.isFinite(v)) return { value: null, error: "Result is invalid" };
    return { value: v, error: null };
  } catch (e) {
    return {
      value: null,
      error: e instanceof Error ? e.message : "Parse error",
    };
  }
}

export function isPlainNumber(expr: string): boolean {
  const t = expr.trim();
  if (!t) return false;
  return /^-?\d+(\.\d+)?%?$/.test(t);
}
