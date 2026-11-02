import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The badge covers the first bottom-nav tab on phones.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
