import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  // Auth routes (standalone, no layout)
  route("login", "routes/auth/login.tsx"),
  route("forgot-password", "routes/auth/forgot-password.tsx"),
  route("reset-password", "routes/auth/reset-password.tsx"),

  // Portal routes (portal layout with sidebar, header, auth guard)
  layout("routes/portal/portal-layout.tsx", [
    route("portal/dashboard", "routes/portal/dashboard.tsx"),
    // Tickets
    route("portal/tickets", "routes/portal/tickets/index.tsx"),
    route("portal/tickets/new", "routes/portal/tickets/new.tsx"),
    route("portal/tickets/:ticketId", "routes/portal/tickets/detail.tsx"),
    // Documents
    route("portal/documents", "routes/portal/documents/index.tsx"),
    route("portal/documents/:documentId", "routes/portal/documents/detail.tsx"),
    // News
    route("portal/news", "routes/portal/news/index.tsx"),
    route("portal/news/:slug", "routes/portal/news/detail.tsx"),
    // Billing
    route("portal/billing", "routes/portal/billing/index.tsx"),
    route("portal/billing/invoices", "routes/portal/billing/invoices.tsx"),
    route("portal/billing/invoices/:invoiceId", "routes/portal/billing/invoice-detail.tsx"),
    // Admin routes
    route("portal/admin/tickets", "routes/portal/admin/tickets.tsx"),
    route("portal/admin/tickets/:ticketId", "routes/portal/admin/ticket-detail.tsx"),
    route("portal/admin/users", "routes/portal/admin/users/index.tsx"),
    route("portal/admin/users/invite", "routes/portal/admin/users/invite.tsx"),
    route("portal/admin/users/:userId", "routes/portal/admin/users/detail.tsx"),
    route("portal/admin/documents", "routes/portal/admin/documents/index.tsx"),
    route("portal/admin/documents/upload", "routes/portal/admin/documents/upload.tsx"),
    route("portal/admin/documents/:documentId", "routes/portal/admin/documents/detail.tsx"),
    route("portal/admin/news", "routes/portal/admin/news/index.tsx"),
    route("portal/admin/news/new", "routes/portal/admin/news/new.tsx"),
    route("portal/admin/news/:newsId", "routes/portal/admin/news/detail.tsx"),
    route("portal/admin/billing", "routes/portal/admin/billing.tsx"),
  ]),

  // Marketing site (public)
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
