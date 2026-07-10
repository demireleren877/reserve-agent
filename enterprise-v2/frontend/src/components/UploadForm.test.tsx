import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadForm } from "./UploadForm";

describe("UploadForm", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders triangle type selector and file input", () => {
    render(<UploadForm onLoaded={() => {}} />);
    expect(screen.getByLabelText(/excel dosyası/i)).toBeInTheDocument();
    // 4 selects: triangle type, cumulative/incremental, origin granularity, dev granularity
    expect(screen.getAllByRole("combobox")).toHaveLength(4);
  });

  it("calls onLoaded with triangle on successful upload", async () => {
    const fakeTriangle = {
      origin_periods: [2023],
      development_periods: [1],
      values: [[100]],
      triangle_type: "paid" as const,
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ triangle: fakeTriangle, warnings: [] }),
    });

    const onLoaded = vi.fn();
    render(<UploadForm onLoaded={onLoaded} />);

    const file = new File(["dummy"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = screen.getByLabelText(/excel dosyası/i);
    await userEvent.upload(input, file);

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(fakeTriangle));
  });

  it("shows error on upload failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Bozuk dosya" }),
    });

    render(<UploadForm onLoaded={() => {}} />);
    const file = new File(["x"], "t.xlsx");
    await userEvent.upload(screen.getByLabelText(/excel dosyası/i), file);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/bozuk/i),
    );
  });
});
