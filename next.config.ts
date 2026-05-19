import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude PDF parsing packages from serverless minification bundle
  serverExternalPackages: ["pdf2json", "pdf-parse"],
};

export default nextConfig;