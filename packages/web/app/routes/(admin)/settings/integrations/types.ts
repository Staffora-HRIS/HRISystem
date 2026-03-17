/**
 * Integrations Types
 *
 * Shared type definitions, constants, and helpers for the integrations
 * management page and its extracted components.
 */

import type { LucideIcon } from "lucide-react";
import {
  Shield,
  CreditCard,
  MessageSquare,
  FileSignature,
  Briefcase,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface IntegrationResponse {
  id: string;
  tenant_id: string;
  provider: string;
  name: string;
  description: string | null;
  category: string;
  status: "connected" | "disconnected" | "error";
  last_sync_at: string | null;
  error_message: string | null;
  webhook_url: string | null;
  enabled: boolean;
  connected_at: string | null;
  connected_by: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationListResponse {
  items: IntegrationResponse[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

// ---------------------------------------------------------------------------
// Merged integration type (catalog + backend data)
// ---------------------------------------------------------------------------

export interface MergedIntegration {
  provider: string;
  name: string;
  description: string | null;
  category: string;
  icon: LucideIcon;
  status: "connected" | "disconnected" | "error";
  lastSyncAt: string | null;
  errorMessage: string | null;
  backendId: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Known provider definitions with display metadata */
export const PROVIDER_CATALOG = [
  {
    provider: "azure-ad",
    name: "Azure Active Directory",
    description: "Single sign-on and user provisioning with Microsoft Azure AD",
    category: "Identity & SSO",
    icon: Shield,
  },
  {
    provider: "okta",
    name: "Okta",
    description: "Enterprise identity and access management",
    category: "Identity & SSO",
    icon: Shield,
  },
  {
    provider: "sage",
    name: "Sage Payroll",
    description: "Payroll and HR data synchronisation with Sage",
    category: "Payroll",
    icon: CreditCard,
  },
  {
    provider: "xero",
    name: "Xero Payroll",
    description: "Payroll processing and reporting integration",
    category: "Payroll",
    icon: CreditCard,
  },
  {
    provider: "slack",
    name: "Slack",
    description: "Send notifications and updates to Slack channels",
    category: "Communication",
    icon: MessageSquare,
  },
  {
    provider: "teams",
    name: "Microsoft Teams",
    description: "Integrate with Microsoft Teams for notifications",
    category: "Communication",
    icon: MessageSquare,
  },
  {
    provider: "docusign",
    name: "DocuSign",
    description: "Electronic signatures for HR documents",
    category: "E-Signature",
    icon: FileSignature,
  },
  {
    provider: "adobe-sign",
    name: "Adobe Sign",
    description: "Digital document signing and workflows",
    category: "E-Signature",
    icon: FileSignature,
  },
  {
    provider: "linkedin",
    name: "LinkedIn Recruiter",
    description: "Import candidates and sync job postings",
    category: "Recruiting",
    icon: Briefcase,
  },
  {
    provider: "indeed",
    name: "Indeed",
    description: "Post jobs and receive applications from Indeed",
    category: "Recruiting",
    icon: Briefcase,
  },
  {
    provider: "google-calendar",
    name: "Google Calendar",
    description: "Sync leave and events with Google Calendar",
    category: "Calendar",
    icon: Calendar,
  },
  {
    provider: "outlook-calendar",
    name: "Outlook Calendar",
    description: "Sync leave and events with Outlook Calendar",
    category: "Calendar",
    icon: Calendar,
  },
] as const;

export const CATEGORIES = [
  "All",
  "Identity & SSO",
  "Payroll",
  "Communication",
  "E-Signature",
  "Recruiting",
  "Calendar",
];

export const STATUS_CONFIG = {
  connected: {
    label: "Connected",
    variant: "success" as const,
    icon: CheckCircle2,
  },
  disconnected: {
    label: "Not Connected",
    variant: "secondary" as const,
    icon: XCircle,
  },
  error: {
    label: "Error",
    variant: "error" as const,
    icon: AlertTriangle,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map provider key to its catalog metadata */
export function getProviderMeta(provider: string) {
  return PROVIDER_CATALOG.find((p) => p.provider === provider);
}

/** Format a relative time string from an ISO date */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}
