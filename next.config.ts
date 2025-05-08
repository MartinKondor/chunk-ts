import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  basePath: isProd ? "/chunk-ts" : "",
  assetPrefix: isProd ? "/chunk-ts/" : "",
  images: { unoptimized: true },
  output: "export",
};

export default nextConfig;
