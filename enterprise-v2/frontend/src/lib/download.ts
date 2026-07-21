/**
 * Dosya indirme — masaüstü (pywebview) ve tarayıcı uyumlu.
 * pywebview tarayıcı download'unu (anchor download) desteklemez; varsa native
 * "Farklı Kaydet" köprüsü (window.pywebview.api.save_file) kullanılır, yoksa
 * blob + anchor'a düşülür.
 */

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type PyBridge = {
  pywebview?: {
    api?: { save_file?: (filename: string, b64: string) => Promise<unknown> };
  };
};

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function downloadFile(
  buf: ArrayBuffer,
  filename: string,
  mime: string = XLSX_MIME,
): Promise<void> {
  const bridge = (window as unknown as PyBridge).pywebview;
  if (bridge?.api?.save_file) {
    const res = (await bridge.api.save_file(filename, bufToBase64(buf))) as
      | { ok?: boolean; cancelled?: boolean; error?: string }
      | undefined;
    if (res && res.ok === false && !res.cancelled) {
      throw new Error(res.error || "Dosya kaydedilemedi");
    }
    return;
  }
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
