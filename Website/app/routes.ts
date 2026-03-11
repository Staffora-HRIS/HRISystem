import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  layout("routes/marketing-layout.tsx", [
    index("routes/home.tsx"),
    route("features", "routes/features.tsx"),
    route("pricing", "routes/pricing.tsx"),
    route("about", "routes/about.tsx"),
    route("contact", "routes/contact.tsx"),
    route("legal/terms", "routes/terms.tsx"),
    route("legal/privacy", "routes/privacy.tsx"),
  ]),
] satisfies RouteConfig;
