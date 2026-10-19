import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The portal is fully behind auth: every route reads the session, so Cache Components
// would only add Suspense boundaries without anything to prerender.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PDF generation reads the Geist TTF files at runtime
  outputFileTracingIncludes: {
    "/angebot": ["./node_modules/geist/dist/fonts/geist-sans/Geist-{Regular,Bold}.ttf", "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf"],
    "/rechnungen/*/pdf": ["./node_modules/geist/dist/fonts/geist-sans/Geist-{Regular,Bold}.ttf", "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
