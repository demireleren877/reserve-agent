import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadForm } from "./UploadForm";

// Network/auth sınırını mock'la — uploadExcel Firebase auth + fetch içerir;
// component testinde bunların gerçeği koşulmaz (test ortamında auth init yok).
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, uploadExcel: vi.fn() };
});

import { uploadExcel } from "@/lib/api";
const uploadExcelMock = uploadExcel as unknown as ReturnType<typeof vi.fn>;

describe("UploadForm", () => {
  beforeEach(() => {
    uploadExcelMock.mockReset();
  });

  it("renders triangle type selector and file input", () => {
    render(<UploadForm onLoaded={() => {}} />);
    expect(screen.getByLabelText(/excel dosyası/i)).toBeInTheDocument();
    // 4 selects: triangle type, cumulative/incremental, origin granularity, dev granularity
    expect(screen.getAllByRole("combobox")).toHaveLength(4);
  });

  it("calls onLoaded with triangle on successful upload", async () => {
    const fakeTriangle = {
      origin_periods: ["2023"],
      development_periods: [1],
      values: [[100]],
      triangle_type: "paid" as const,
    };
    uploadExcelMock.mockResolvedValue({ triangle: fakeTriangle, warnings: [] });

    const onLoaded = vi.fn();
    render(<UploadForm onLoaded={onLoaded} />);

    const file = new File(["dummy"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await userEvent.upload(screen.getByLabelText(/excel dosyası/i), file);

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(fakeTriangle));
  });

  it("shows error on upload failure", async () => {
    uploadExcelMock.mockRejectedValue(new Error("Bozuk dosya"));

    render(<UploadForm onLoaded={() => {}} />);
    const file = new File(["x"], "t.xlsx");
    await userEvent.upload(screen.getByLabelText(/excel dosyası/i), file);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/bozuk/i),
    );
  });
});
