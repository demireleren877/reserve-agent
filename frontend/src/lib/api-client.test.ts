/**
 * api.ts fetch katmanı testleri — fetch ve firebase auth mock'lanır.
 * Özellikle chatWithAgent: agent ↔ backend sözleşmesinin frontend yarısı
 * (modules payload, legacy triangle yolu, full_history, hata aktarımı).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/firebase", () => ({
  getFirebaseAuth: vi.fn(() => ({ currentUser: null })),
}));

import { getFirebaseAuth } from "@/lib/auth/firebase";
import {
  API_BASE,
  chatWithAgent,
  compute,
  listModels,
  uploadExcel,
} from "@/lib/api";
import type { Triangle } from "@/types/triangle";

const TRIANGLE = {
  origin_periods: ["2020"],
  development_periods: [1],
  values: [[100]],
  triangle_type: "paid",
  origin_granularity: "yearly",
  development_granularity: "yearly",
} as Triangle;

function mockFetch(status = 200, json: unknown = { ok: true }) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(json),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("chatWithAgent", () => {
  it("modules payload'ı 'modules' anahtarıyla gönderir", async () => {
    const fetchMock = mockFetch(200, { assistant_message: "ok" });
    const modules = { reserve: { session_state: { a: 1 } } };
    await chatWithAgent([{ role: "user", content: "x" }], modules);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/v1/agent/chat`);
    const body = JSON.parse(init.body);
    expect(body.modules).toEqual(modules);
    expect(body.triangle).toBeUndefined();
    expect(body.full_history).toBeUndefined();
  });

  it("legacy triangle yolu: 'triangle' + 'session_state' gönderir", async () => {
    const fetchMock = mockFetch(200, { assistant_message: "ok" });
    await chatWithAgent([{ role: "user", content: "x" }], TRIANGLE, "m/1", null);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.triangle).toEqual(TRIANGLE);
    expect(body.modules).toBeUndefined();
    expect(body.model).toBe("m/1");
  });

  it("fullHistory doluysa body'ye eklenir, boşsa eklenmez", async () => {
    const fetchMock = mockFetch(200, {});
    const hist = [{ role: "tool", content: "{}" }];
    await chatWithAgent([], {}, null, null, hist);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).full_history).toEqual(hist);

    await chatWithAgent([], {}, null, null, []);
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).full_history,
    ).toBeUndefined();
  });

  it("backend detail mesajı Error olarak fırlatılır", async () => {
    mockFetch(502, { detail: "Agent hatası: LLM down" });
    await expect(chatWithAgent([], {})).rejects.toThrow(
      "Agent hatası: LLM down",
    );
  });

  it("auth kullanıcı varsa Bearer header eklenir", async () => {
    vi.mocked(getFirebaseAuth).mockReturnValue({
      currentUser: { getIdToken: () => Promise.resolve("tok-123") },
    } as unknown as ReturnType<typeof getFirebaseAuth>);
    const fetchMock = mockFetch(200, {});
    await chatWithAgent([], {});
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer tok-123",
    );
  });

  it("getIdToken hatası sessizce header'sız devam eder", async () => {
    vi.mocked(getFirebaseAuth).mockReturnValue({
      currentUser: { getIdToken: () => Promise.reject(new Error("x")) },
    } as unknown as ReturnType<typeof getFirebaseAuth>);
    const fetchMock = mockFetch(200, {});
    await chatWithAgent([], {});
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});

describe("compute", () => {
  it("varsayılanlar: volume_weighted, boş exclusion", async () => {
    const fetchMock = mockFetch(200, {});
    await compute(TRIANGLE);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.method).toBe("volume_weighted");
    expect(body.excluded_origins).toEqual([]);
    expect(body.n_years).toBeNull();
  });

  it("hata detail'i fırlatılır", async () => {
    mockFetch(400, { detail: "Geçersiz üçgen" });
    await expect(compute(TRIANGLE)).rejects.toThrow("Geçersiz üçgen");
  });

  it("detail yoksa HTTP status mesajı", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("gövde yok")),
    });
    vi.stubGlobal("fetch", fn);
    await expect(compute(TRIANGLE)).rejects.toThrow("Hesaplama hatası");
  });
});

describe("uploadExcel", () => {
  it("10 MB üzeri dosya istemcide reddedilir", async () => {
    const big = new File([new ArrayBuffer(11 * 1024 * 1024)], "big.xlsx");
    await expect(
      uploadExcel(big, {
        triangle_type: "paid",
        origin_granularity: "yearly",
        development_granularity: "yearly",
        cumulative: true,
      }),
    ).rejects.toThrow("10 MB");
  });

  it("dosyayı base64 olarak gönderir", async () => {
    const fetchMock = mockFetch(200, { triangle: TRIANGLE, warnings: [] });
    const file = new File([new Uint8Array([1, 2, 3])], "t.xlsx");
    await uploadExcel(file, {
      triangle_type: "incurred",
      origin_granularity: "yearly",
      development_granularity: "yearly",
      cumulative: false,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.file_b64).toBe(btoa(String.fromCharCode(1, 2, 3)));
    expect(body.triangle_type).toBe("incurred");
    expect(body.cumulative).toBe(false);
  });
});

describe("listModels", () => {
  it("model listesini döner", async () => {
    mockFetch(200, { models: [{ id: "m1", label: "M1" }], default: "m1" });
    const out = await listModels();
    expect(out.models[0].id).toBe("m1");
  });
});
