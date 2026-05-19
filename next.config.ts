import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude PDF parsing packages from serverless minification bundle
  serverExternalPackages: ["pdf2json", "pdf-parse"],
  
  // Increase serverless function timeout for PDF processing
  // Note: Vercel Hobby plan max is 10s, Pro plan max is 60s
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;