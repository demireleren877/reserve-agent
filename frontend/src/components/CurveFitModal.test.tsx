import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurveFitModal } from "./CurveFitModal";
import type { TailFit } from "@/lib/tail-fit";

const unavailable: TailFit = { cdfs: [], params: {}, ok: false };

describe("CurveFitModal zoom", () => {
  it("grafiği yakınlaştırır, uzaklaştırır ve sıfırlar", async () => {
    const user = userEvent.setup();
    render(
      <CurveFitModal
        selectedLDFs={[1.5, 1.3, 1.2, 1.1, 1.05]}
        includeFlags={[true, true, true, true, true]}
        devPeriods={[1, 2, 3, 4, 5]}
        fits={{
          exp: { cdfs: [2, 1.5, 1.2, 1.08, 1.02, 1], params: { a: 1, b: -1 }, ok: true },
          invPower: unavailable,
          power: unavailable,
          weibull: unavailable,
        }}
        onClose={() => {}}
      />,
    );

    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const reset = screen.getByRole("button", { name: "Reset zoom" });
    expect((zoomOut as HTMLButtonElement).disabled).toBe(true);

    await user.click(zoomIn);
    expect(reset.textContent).toBe("150%");
    expect((zoomOut as HTMLButtonElement).disabled).toBe(false);

    await user.click(zoomOut);
    expect(reset.textContent).toBe("100%");

    await user.click(zoomIn);
    await user.click(reset);
    expect(reset.textContent).toBe("100%");

    const chart = document.querySelector("svg");
    expect(chart).not.toBeNull();
    Object.defineProperty(chart, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 880, height: 440, right: 880, bottom: 440, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.wheel(chart!, { clientX: 400, clientY: 200, deltaY: -160 });
    expect(reset.textContent).not.toBe("100%");
    fireEvent.doubleClick(chart!);
    expect(reset.textContent).toBe("100%");
  });
});
