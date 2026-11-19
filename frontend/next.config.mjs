/** @type {import('next').NextConfig} */
// Hinweis: Das Frontend ruft das Backend direkt auf (siehe lib/api/client.js).
// Ein Rewrite-Proxy über Next.js wird bewusst nicht verwendet (abgeschnittene Antworten unter Windows).
const nextConfig = {
  reactStrictMode: true,
  // Eigenständiger Server-Build für das Docker-Image (siehe frontend/Dockerfile)
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
