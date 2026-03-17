const API_BASE = "/api/v1/client-portal";

export class PortalApiError extends Error {
  public status: number;
  public code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "PortalApiError";
    this.status = status;
    this.code = code;
  }
}

async function portalFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: { message: "Request failed" } }));
    throw new PortalApiError(
      res.status,
      error.error?.message || "Request failed",
      error.error?.code,
    );
  }

  return res.json() as Promise<T>;
}

export const portalApi = {
  auth: {
    login: (data: { email: string; password: string; rememberMe?: boolean }) =>
      portalFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    logout: () => portalFetch("/auth/logout", { method: "POST" }),
    forgotPassword: (email: string) =>
      portalFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    resetPassword: (data: { token: string; password: string }) =>
      portalFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    me: () => portalFetch("/auth/me"),
  },
  dashboard: {
    get: () => portalFetch("/dashboard"),
  },
  tickets: {
    list: (params?: URLSearchParams) =>
      portalFetch(`/tickets?${params || ""}`),
    get: (id: string) => portalFetch(`/tickets/${id}`),
    create: (data: Record<string, unknown>) =>
      portalFetch("/tickets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    reply: (id: string, data: Record<string, unknown>) =>
      portalFetch(`/tickets/${id}/messages`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  documents: {
    list: (params?: URLSearchParams) =>
      portalFetch(`/documents?${params || ""}`),
    get: (id: string) => portalFetch(`/documents/${id}`),
    acknowledge: (id: string) =>
      portalFetch(`/documents/${id}/acknowledge`, { method: "POST" }),
  },
  news: {
    list: (params?: URLSearchParams) => portalFetch(`/news?${params || ""}`),
    get: (slug: string) => portalFetch(`/news/${slug}`),
  },
  billing: {
    get: () => portalFetch("/billing"),
    invoices: (params?: URLSearchParams) =>
      portalFetch(`/billing/invoices?${params || ""}`),
    invoice: (id: string) => portalFetch(`/billing/invoices/${id}`),
  },
  admin: {
    tickets: {
      list: (params?: URLSearchParams) =>
        portalFetch(`/admin/tickets?${params || ""}`),
      update: (id: string, data: Record<string, unknown>) =>
        portalFetch(`/admin/tickets/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
    },
    users: {
      list: (params?: URLSearchParams) =>
        portalFetch(`/admin/users?${params || ""}`),
      get: (id: string) => portalFetch(`/admin/users/${id}`),
      create: (data: Record<string, unknown>) =>
        portalFetch("/admin/users", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (id: string, data: Record<string, unknown>) =>
        portalFetch(`/admin/users/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
    },
    documents: {
      create: (data: Record<string, unknown>) =>
        portalFetch("/admin/documents", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (id: string, data: Record<string, unknown>) =>
        portalFetch(`/admin/documents/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        portalFetch(`/admin/documents/${id}`, { method: "DELETE" }),
    },
    news: {
      create: (data: Record<string, unknown>) =>
        portalFetch("/admin/news", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (id: string, data: Record<string, unknown>) =>
        portalFetch(`/admin/news/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        portalFetch(`/admin/news/${id}`, { method: "DELETE" }),
    },
  },
};
