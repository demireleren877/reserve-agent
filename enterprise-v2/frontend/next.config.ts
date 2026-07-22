import type { NextConfig } from "next";

// DESKTOP_BUILD=1 → pywebview için statik export (tek klasör, sunucu gerektirmez).
// Aksi halde normal (Docker/dev) build.
const desktop = process.env.DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // Masaüstü: frontend + API aynı sunucudan (aynı origin) → API_BASE="" zorunlu.
  // NEXT_PUBLIC_API_BASE env'i unutulsa bile bağlantı kırılmasın diye burada sabitlenir.
  ...(desktop
    ? { output: "export", trailingSlash: true, env: { NEXT_PUBLIC_API_BASE: "" } }
    : {}),
};

export default nextConfig;
