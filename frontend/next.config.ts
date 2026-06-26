import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Hide the dev-mode indicator badge — it overlaps the bottom-docked UI in the
  // phone frame and pollutes demo screenshots.
  devIndicators: false,
};

export default nextConfig;
