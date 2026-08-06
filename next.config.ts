import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit (used for invoice PDFs) pulls in fontkit, which isn't
  // compatible with being bundled by Next's compiler — it needs to be
  // loaded as a plain Node module at request time instead. Without this,
  // importing pdfkit anywhere breaks the dev server with a fontkit/
  // @swc-helpers export error.
  serverExternalPackages: ["pdfkit", "fontkit"],
};

export default nextConfig;
