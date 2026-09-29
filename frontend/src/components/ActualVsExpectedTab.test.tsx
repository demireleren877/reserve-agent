import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ActualVsExpectedTab } from "./ActualVsExpectedTab";

describe("ActualVsExpectedTab", () => {
  it("tablonun altında toplam değerleri gösterir", () => {
    const { container } = render(
      <ActualVsExpectedTab
        priorLabel="2026Q1"
        basis="Attritional"
        result={{
          rows: [
            { origin: "2023", development: "2→3", priorCumulative: 100, currentCumulative: 130, actual: 30, expected: 20, variance: 10, variancePct: 0.5 },
            { origin: "2024", development: "1→2", priorCumulative: 200, currentCumulative: 240, actual: 40, expected: 50, variance: -10, variancePct: -0.2 },
          ],
          totals: { actual: 70, expected: 70, variance: 0, variancePct: 0 },
        }}
      />,
    );

    const cells = [...container.querySelectorAll("tfoot th, tfoot td")].map((cell) => cell.textContent);
    expect(cells).toEqual(["Total", "2 comparable periods", "300", "370", "70", "70", "0", "%0.0"]);
  });
});
