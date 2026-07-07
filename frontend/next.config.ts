import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/query",
        destination: "http://localhost:8000/api/query",
      },
      {
        source: "/api/health",
        destination: "http://localhost:8000/health",
      },
      {
        source: "/api/subgraph",
        destination: "http://localhost:8000/api/subgraph",
      },
      {
        source: "/api/ingestion/:path*",
        destination: "http://localhost:8000/ingestion/:path*",
      },
      {
        source: "/upload",
        destination: "http://localhost:8000/upload",
      },
      {
        source: "/api/upload",
        destination: "http://localhost:8000/api/upload",
      },
      {
        source: "/api/upload/:path*",
        destination: "http://localhost:8000/api/upload/:path*",
      },
    ];
  },
};

export default nextConfig;
