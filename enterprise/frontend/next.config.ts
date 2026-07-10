import type { NextConfig } from "next";

// DESKTOP_BUILD=1 → pywebview için statik export (tek klasör, sunucu gerektirmez).
// Aksi halde normal (Docker/dev) build.
const desktop = process.env.DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  ...(desktop ? { output: "export", trailingSlash: true } : {}),
};

export default nextConfig;
