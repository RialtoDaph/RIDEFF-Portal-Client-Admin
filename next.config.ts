import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The portal is fully behind auth: every route reads the session, so Cache Components
// would only add Suspense boundaries without anything to prerender.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
