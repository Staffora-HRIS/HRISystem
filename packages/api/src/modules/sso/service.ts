/**
 * SSO Module - Service Layer
 *
 * Business logic for SSO configuration management and OIDC login flow.
 *
 * Key responsibilities:
 * - CRUD operations for SSO configurations (admin)
 * - OIDC authorization URL generation (public)
 * - OIDC callback handling: token exchange, user resolution, session creation
 * - SSO login attempt auditing
 * - Domain restriction enforcement
 * - JIT (Just-In-Time) user provisioning
 *
 * SAML support is validated at the schema level but the actual SAML protocol
 * flow is not implemented here (it would require a SAML library like saml2-js).
 * The configuration is stored so that a SAML flow can be added later.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import {
  SsoConfigRepository,
  type SsoConfigRow,
  type SsoLoginAttemptRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateSsoConfig,
  UpdateSsoConfig,
  SsoConfigResponse,
  SsoLoginAttemptResponse,
  SsoConfigFilters,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

interface OidcTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

interface OidcUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  [key: string]: unknown;
}

// =============================================================================
// Domain Event Types
// =============================================================================

type SsoEventType =
  | "sso.config.created"
  | "sso.config.updated"
  | "sso.config.deleted"
  | "sso.config.enabled"
  | "sso.config.disabled"
  | "sso.login.success"
  | "sso.login.failed";

// =============================================================================
// Mappers
// =============================================================================

function mapRowToResponse(row: SsoConfigRow): SsoConfigResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    provider_type: row.providerType as "saml" | "oidc",
    provider_name: row.providerName,
    client_id: row.clientId,
    has_client_secret: row.clientSecretEncrypted !== null,
    issuer_url: row.issuerUrl,
    metadata_url: row.metadataUrl,
    certificate: row.certificate,
    attribute_mapping: row.attributeMapping ?? {},
    enabled: row.enabled,
    auto_provision: row.autoProvision,
    allowed_domains: Array.isArray(row.allowedDomains) ? row.allowedDomains : [],
    default_role_id: row.defaultRoleId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    created_by: row.createdBy,
    updated_by: row.updatedBy,
  };
}

function mapLoginAttemptToResponse(row: SsoLoginAttemptRow): SsoLoginAttemptResponse {
  return {
    id: row.id,
    sso_config_id: row.ssoConfigId,
    idp_subject: row.idpSubject,
    email: row.email,
    user_id: row.userId,
    status: row.status,
    error_message: row.errorMessage,
    ip_address: row.ipAddress,
    created_at: row.createdAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class SsoService {
  constructor(
    private repository: SsoConfigRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    aggregateId: string,
    eventType: SsoEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        'sso_configuration',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // OIDC URL Helpers
  // ===========================================================================

  /**
   * Get the base URL for the API (used to construct callback URLs).
   */
  private getBaseUrl(): string {
    return process.env["BETTER_AUTH_URL"] || process.env["API_URL"] || "http://localhost:3000";
  }

  /**
   * Construct the OIDC authorization URL for a given SSO configuration.
   */
  private buildOidcAuthorizationUrl(
    config: SsoConfigRow & { tenantIdResolved?: string },
    state: string,
    tenantSlug: string
  ): string {
    const issuer = config.issuerUrl;
    if (!issuer) {
      throw new Error("OIDC issuer URL is required");
    }

    // Standard OIDC authorization endpoint: {issuer}/authorize
    // For well-known providers this is usually discoverable, but we build it
    // from the issuer for now. A future enhancement could fetch /.well-known/openid-configuration.
    const authorizationEndpoint = issuer.endsWith("/")
      ? `${issuer}authorize`
      : `${issuer}/authorize`;

    const callbackUrl = `${this.getBaseUrl()}/api/v1/auth/sso/${tenantSlug}/${config.id}/callback`;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId || "",
      redirect_uri: callbackUrl,
      scope: "openid email profile",
      state,
    });

    return `${authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Generate a cryptographically secure state parameter for OIDC CSRF protection.
   * The state encodes the configId so we can look it up on callback.
   */
  private generateOidcState(configId: string): string {
    const nonce = crypto.randomUUID();
    const secret = process.env["SSO_ENCRYPTION_KEY"] || process.env["BETTER_AUTH_SECRET"] || process.env["SESSION_SECRET"] || "";
    const payload = `${configId}:${nonce}`;
    const hmac = createHmac("sha256", secret).update(payload).digest("hex");
    // Encode as base64url: configId:nonce:hmac
    return Buffer.from(`${payload}:${hmac}`).toString("base64url");
  }

  /**
   * Validate and decode an OIDC state parameter.
   * Returns the configId if valid, null otherwise.
   */
  private validateOidcState(state: string): string | null {
    try {
      const decoded = Buffer.from(state, "base64url").toString("utf-8");
      const parts = decoded.split(":");
      if (parts.length !== 3) return null;

      const [configId, nonce, providedHmac] = parts;
      const secret = process.env["SSO_ENCRYPTION_KEY"] || process.env["BETTER_AUTH_SECRET"] || process.env["SESSION_SECRET"] || "";
      const expectedHmac = createHmac("sha256", secret)
        .update(`${configId}:${nonce}`)
        .digest("hex");

      // Constant-time comparison
      if (providedHmac.length !== expectedHmac.length) return null;
      const a = Buffer.from(providedHmac, "utf-8");
      const b = Buffer.from(expectedHmac, "utf-8");
      if (!timingSafeEqual(a, b)) return null;

      return configId;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // OIDC Token Exchange
  // ===========================================================================

  /**
   * Exchange an OIDC authorization code for tokens.
   */
  private async exchangeOidcCode(
    config: SsoConfigRow,
    code: string,
    tenantSlug: string,
    clientSecret: string
  ): Promise<OidcTokenResponse> {
    const issuer = config.issuerUrl;
    if (!issuer) {
      throw new Error("OIDC issuer URL is required for token exchange");
    }

    const tokenEndpoint = issuer.endsWith("/")
      ? `${issuer}token`
      : `${issuer}/token`;

    const callbackUrl = `${this.getBaseUrl()}/api/v1/auth/sso/${tenantSlug}/${config.id}/callback`;

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl,
        client_id: config.clientId || "",
        client_secret: clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${body}`);
    }

    return (await response.json()) as OidcTokenResponse;
  }

  /**
   * Fetch user info from the OIDC userinfo endpoint or decode the id_token.
   * For simplicity, we decode the id_token JWT payload (without signature
   * verification, since we trust the token came from a verified exchange).
   */
  private decodeIdToken(idToken: string): OidcUserInfo {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid id_token format");
    }
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    return payload as OidcUserInfo;
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * List SSO configurations with filters and pagination.
   */
  async listConfigs(
    ctx: TenantContext,
    filters: SsoConfigFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<SsoConfigResponse>> {
    const result = await this.repository.listConfigs(ctx, filters, pagination);
    return {
      items: result.items.map(mapRowToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single SSO configuration by ID.
   */
  async getConfig(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<SsoConfigResponse>> {
    const row = await this.repository.getById(ctx, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSO configuration not found",
          details: { id },
        },
      };
    }
    return { success: true, data: mapRowToResponse(row) };
  }

  /**
   * Create a new SSO configuration.
   * Validates that OIDC providers have required fields.
   */
  async createConfig(
    ctx: TenantContext,
    data: CreateSsoConfig
  ): Promise<ServiceResult<SsoConfigResponse>> {
    // Validate OIDC-specific requirements
    if (data.provider_type === "oidc") {
      if (!data.client_id) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "client_id is required for OIDC providers",
          },
        };
      }
      if (!data.issuer_url) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "issuer_url is required for OIDC providers",
          },
        };
      }
    }

    // Validate SAML-specific requirements
    if (data.provider_type === "saml") {
      if (!data.issuer_url && !data.metadata_url) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Either issuer_url or metadata_url is required for SAML providers",
          },
        };
      }
    }

    const row = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.create(
        ctx,
        {
          providerType: data.provider_type,
          providerName: data.provider_name,
          clientId: data.client_id ?? null,
          clientSecret: data.client_secret ?? null,
          issuerUrl: data.issuer_url ?? null,
          metadataUrl: data.metadata_url ?? null,
          certificate: data.certificate ?? null,
          attributeMapping: data.attribute_mapping ?? {},
          enabled: data.enabled ?? false,
          autoProvision: data.auto_provision ?? false,
          allowedDomains: data.allowed_domains ?? [],
          defaultRoleId: data.default_role_id ?? null,
          createdBy: ctx.userId ?? null,
        },
        tx
      );

      await this.emitEvent(tx, ctx, created.id, "sso.config.created", {
        configId: created.id,
        providerType: data.provider_type,
        providerName: data.provider_name,
        enabled: data.enabled ?? false,
      });

      return created;
    });

    return { success: true, data: mapRowToResponse(row) };
  }

  /**
   * Update an SSO configuration.
   */
  async updateConfig(
    ctx: TenantContext,
    id: string,
    data: UpdateSsoConfig
  ): Promise<ServiceResult<SsoConfigResponse>> {
    const existing = await this.repository.getById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSO configuration not found",
          details: { id },
        },
      };
    }

    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const row = await this.repository.update(ctx, id, data, tx);

      if (row) {
        // Determine if enabled/disabled changed for specific event
        let eventType: SsoEventType = "sso.config.updated";
        if (data.enabled === true && !existing.enabled) {
          eventType = "sso.config.enabled";
        } else if (data.enabled === false && existing.enabled) {
          eventType = "sso.config.disabled";
        }

        await this.emitEvent(tx, ctx, id, eventType, {
          configId: id,
          changes: Object.keys(data),
        });
      }

      return row;
    });

    if (!updated) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSO configuration not found after update",
          details: { id },
        },
      };
    }

    return { success: true, data: mapRowToResponse(updated) };
  }

  /**
   * Delete an SSO configuration.
   */
  async deleteConfig(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const existing = await this.repository.getById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSO configuration not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(ctx, async (tx) => {
      await this.repository.delete(ctx, id, tx);

      await this.emitEvent(tx, ctx, id, "sso.config.deleted", {
        configId: id,
        providerName: existing.providerName,
        providerType: existing.providerType,
      });
    });

    return { success: true, data: { deleted: true } };
  }

  // ===========================================================================
  // Public SSO Endpoints (no auth required)
  // ===========================================================================

  /**
   * Discover available SSO providers for a tenant.
   * Returns a minimal list of enabled providers (no secrets).
   */
  async discoverProviders(
    tenantSlug: string
  ): Promise<ServiceResult<Array<{ id: string; provider_type: string; provider_name: string }>>> {
    const providers = await this.repository.findEnabledByTenantSlug(tenantSlug);

    if (providers.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No SSO providers configured for this tenant",
          details: { tenantSlug },
        },
      };
    }

    return {
      success: true,
      data: providers.map((p) => ({
        id: p.id,
        provider_type: p.providerType,
        provider_name: p.providerName,
      })),
    };
  }

  /**
   * Initiate an OIDC SSO login flow.
   * Generates a state parameter and returns the IdP authorization URL.
   */
  async initiateOidcLogin(
    tenantSlug: string,
    configId: string
  ): Promise<ServiceResult<{ redirect_url: string; state: string }>> {
    const config = await this.repository.findEnabledByTenantSlugAndConfigId(tenantSlug, configId);
    if (!config) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSO configuration not found or not enabled",
          details: { tenantSlug, configId },
        },
      };
    }

    if (config.providerType !== "oidc") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Only OIDC providers support redirect-based login. SAML support is not yet implemented.",
          details: { providerType: config.providerType },
        },
      };
    }

    if (!config.clientId || !config.issuerUrl) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "SSO configuration is incomplete: client_id and issuer_url are required",
        },
      };
    }

    const state = this.generateOidcState(configId);
    const redirectUrl = this.buildOidcAuthorizationUrl(config, state, tenantSlug);

    return {
      success: true,
      data: { redirect_url: redirectUrl, state },
    };
  }

  /**
   * Handle the OIDC callback after the user authenticates with the IdP.
   *
   * Steps:
   * 1. Validate the state parameter (CSRF protection)
   * 2. Exchange the authorization code for tokens
   * 3. Decode the id_token to get user info
   * 4. Enforce domain restrictions
   * 5. Resolve or auto-provision the user
   * 6. Record the login attempt
   * 7. Return user info for session creation
   */
  async handleOidcCallback(
    tenantSlug: string,
    code: string,
    state: string,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<ServiceResult<{ user_id: string; email: string; tenant_id: string; is_new_user: boolean }>> {
    // Step 1: Validate state
    const configId = this.validateOidcState(state);
    if (!configId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Invalid or expired SSO state parameter",
        },
      };
    }

    // Look up the SSO configuration
    const config = await this.repository.findEnabledByTenantSlugAndConfigId(tenantSlug, configId);
    if (!config) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSO configuration not found or disabled",
        },
      };
    }

    const tenantId = config.tenantIdResolved || config.tenantId;

    // Step 2: Decrypt client secret and exchange code for tokens
    let clientSecret: string;
    try {
      const decrypted = await this.repository.decryptClientSecret(configId);
      if (!decrypted) {
        await this.repository.recordLoginAttempt(tenantId, {
          ssoConfigId: configId,
          idpSubject: "unknown",
          email: null,
          userId: null,
          status: "failed",
          errorMessage: "Client secret not configured",
          ipAddress,
          userAgent,
        });
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "SSO configuration is incomplete: client secret is required for OIDC token exchange",
          },
        };
      }
      clientSecret = decrypted;
    } catch (err) {
      console.error("[SSO] Failed to decrypt client secret:", err);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to process SSO configuration",
        },
      };
    }

    let tokenResponse: OidcTokenResponse;
    try {
      tokenResponse = await this.exchangeOidcCode(config, code, tenantSlug, clientSecret);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Token exchange failed";
      console.error("[SSO] Token exchange error:", errorMsg);

      await this.repository.recordLoginAttempt(tenantId, {
        ssoConfigId: configId,
        idpSubject: "unknown",
        email: null,
        userId: null,
        status: "failed",
        errorMessage: errorMsg,
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "SSO token exchange failed",
        },
      };
    }

    // Step 3: Decode id_token to get user claims
    let userInfo: OidcUserInfo;
    try {
      userInfo = this.decodeIdToken(tokenResponse.id_token);
    } catch (err) {
      console.error("[SSO] Failed to decode id_token:", err);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to decode identity token",
        },
      };
    }

    const email = this.resolveAttribute(userInfo, config.attributeMapping, "email") ?? userInfo.email;
    const name = this.resolveAttribute(userInfo, config.attributeMapping, "name") ?? userInfo.name;
    const sub = userInfo.sub;

    if (!email) {
      await this.repository.recordLoginAttempt(tenantId, {
        ssoConfigId: configId,
        idpSubject: sub,
        email: null,
        userId: null,
        status: "failed",
        errorMessage: "No email claim in IdP response",
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Identity provider did not return an email address",
        },
      };
    }

    // Step 4: Enforce domain restrictions
    const allowedDomains = Array.isArray(config.allowedDomains) ? config.allowedDomains : [];
    if (allowedDomains.length > 0) {
      const emailDomain = email.split("@")[1]?.toLowerCase();
      if (!emailDomain || !allowedDomains.some((d) => d.toLowerCase() === emailDomain)) {
        await this.repository.recordLoginAttempt(tenantId, {
          ssoConfigId: configId,
          idpSubject: sub,
          email,
          userId: null,
          status: "domain_rejected",
          errorMessage: `Email domain '${emailDomain}' is not in the allowed list`,
          ipAddress,
          userAgent,
        });

        return {
          success: false,
          error: {
            code: ErrorCodes.FORBIDDEN,
            message: "Your email domain is not permitted for SSO login with this organisation",
          },
        };
      }
    }

    // Step 5: Resolve existing user or auto-provision
    let userId: string | null = null;
    let isNewUser = false;

    // Look up user by email in the tenant
    const existingUser = await this.findUserByEmail(tenantId, email);
    if (existingUser) {
      userId = existingUser.userId;
    } else if (config.autoProvision) {
      // JIT provision: create user in app."user", app.users, and app.user_tenants
      try {
        userId = await this.provisionUser(tenantId, email, name ?? email, config.defaultRoleId);
        isNewUser = true;
      } catch (err) {
        console.error("[SSO] Auto-provision failed:", err);
        await this.repository.recordLoginAttempt(tenantId, {
          ssoConfigId: configId,
          idpSubject: sub,
          email,
          userId: null,
          status: "failed",
          errorMessage: `Auto-provision failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          ipAddress,
          userAgent,
        });
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to provision user account",
          },
        };
      }
    } else {
      // No auto-provisioning - user must exist
      await this.repository.recordLoginAttempt(tenantId, {
        ssoConfigId: configId,
        idpSubject: sub,
        email,
        userId: null,
        status: "user_not_found",
        errorMessage: "User not found and auto-provisioning is disabled",
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No account found for this email. Contact your administrator to be added to the system.",
        },
      };
    }

    // Step 6: Record successful login attempt
    await this.repository.recordLoginAttempt(tenantId, {
      ssoConfigId: configId,
      idpSubject: sub,
      email,
      userId,
      status: "success",
      errorMessage: null,
      ipAddress,
      userAgent,
    });

    // Step 7: Return user info for session creation by the route handler
    return {
      success: true,
      data: {
        user_id: userId!,
        email,
        tenant_id: tenantId,
        is_new_user: isNewUser,
      },
    };
  }

  // ===========================================================================
  // Login Attempt Audit
  // ===========================================================================

  /**
   * List SSO login attempts for a given configuration.
   */
  async listLoginAttempts(
    ctx: TenantContext,
    configId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<SsoLoginAttemptResponse>> {
    // Verify the config exists and belongs to the tenant
    const config = await this.repository.getById(ctx, configId);
    if (!config) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const result = await this.repository.listLoginAttempts(ctx, configId, pagination);
    return {
      items: result.items.map(mapLoginAttemptToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  /**
   * Resolve a user attribute from the IdP claims using the attribute mapping.
   */
  private resolveAttribute(
    claims: Record<string, unknown>,
    mapping: Record<string, string>,
    field: string
  ): string | null {
    const claimKey = mapping[field];
    if (!claimKey) return null;

    const value = claims[claimKey];
    if (typeof value === "string") return value;
    return null;
  }

  /**
   * Find a user by email in a specific tenant.
   */
  private async findUserByEmail(
    tenantId: string,
    email: string
  ): Promise<{ userId: string } | null> {
    const rows = await this.db.withSystemContext(async (tx) => {
      return tx<Array<{ userId: string }>>`
        SELECT u.id::text AS user_id
        FROM app.users u
        JOIN app.user_tenants ut ON ut.user_id = u.id
        WHERE u.email = ${email.toLowerCase()}
          AND ut.tenant_id = ${tenantId}::uuid
          AND ut.status = 'active'
        LIMIT 1
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Auto-provision a new user for SSO (JIT provisioning).
   * Creates entries in app."user", app.users, app.user_tenants, and optionally role_assignments.
   */
  private async provisionUser(
    tenantId: string,
    email: string,
    name: string,
    defaultRoleId: string | null
  ): Promise<string> {
    const userId = crypto.randomUUID();

    await this.db.withSystemContext(async (tx) => {
      // Create Better Auth user record
      await tx`
        INSERT INTO app."user" (id, email, name, "emailVerified", "createdAt", "updatedAt", status)
        VALUES (${userId}, ${email.toLowerCase()}, ${name}, true, now(), now(), 'active')
      `;

      // Create legacy users record
      await tx`
        INSERT INTO app.users (id, email, name, email_verified, status, created_at, updated_at)
        VALUES (${userId}::uuid, ${email.toLowerCase()}, ${name}, true, 'active', now(), now())
      `;

      // Create account record for SSO (no password)
      await tx`
        INSERT INTO app."account" (id, "userId", "accountId", "providerId", "createdAt", "updatedAt")
        VALUES (${crypto.randomUUID()}, ${userId}, ${userId}, 'sso', now(), now())
      `;

      // Link user to tenant
      await tx`
        INSERT INTO app.user_tenants (user_id, tenant_id, is_primary, status, created_at)
        VALUES (${userId}::uuid, ${tenantId}::uuid, true, 'active', now())
      `;

      // Assign default role if specified
      if (defaultRoleId) {
        await tx`
          INSERT INTO app.role_assignments (id, tenant_id, user_id, role_id, effective_from, created_at)
          VALUES (gen_random_uuid(), ${tenantId}::uuid, ${userId}::uuid, ${defaultRoleId}::uuid, now(), now())
        `;
      }
    });

    return userId;
  }
}
