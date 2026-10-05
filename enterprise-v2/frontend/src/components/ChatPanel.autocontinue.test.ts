import { describe, it, expect } from "vitest";
import { isMultiStepTurn } from "@/components/ChatPanel";

describe("otomatik devam yalnız modelleme akışında", () => {
  it("modelleme komutu ve form cevapları devam eder", () => {
    expect(isMultiStepTurn("Modelle")).toBe(true);
    expect(isMultiStepTurn("bu branşı modelle")).toBe(true);
    expect(isMultiStepTurn("Form responses:\n- Branş: FIRE")).toBe(true);
  });
  it("tek adımlık komutlar devam etmez", () => {
    expect(isMultiStepTurn("sadece 2025 kaza yılı bf olsun")).toBe(false);
    expect(isMultiStepTurn("2021 için loss ratio'yu %30 olarak ayarla")).toBe(false);
    expect(isMultiStepTurn("Volume'ü 5'e çek")).toBe(false);
  });
});
