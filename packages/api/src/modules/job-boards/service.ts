/**
 * Job Boards Service
 *
 * Business logic for managing job board integrations and publishing
 * vacancies to external UK job boards.
 *
 * Features:
 *   - Provider abstraction: each board implements JobBoardProvider interface
 *   - Integration management: per-tenant API credential storage
 *   - Single and multi-board posting with atomic outbox events
 *   - Withdraw (soft-delete) with provider notification
 *   - Config redaction for API responses (no secrets in transit)
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import {
  JobBoardsRepository,
  type TenantContext,
  type JobBoardPosting,
  type JobBoardIntegration,
} from "./repository";

// =============================================================================
// Provider Abstraction Interface
// =============================================================================

export interface JobPostPayload {
  title: string;
  description: string;
  location?: string;
  employmentType?: string;
  applicationUrl?: string;
  expiresAt?: string;
  requirements?: Record<string, unknown>;
}

export interface ProviderPostResult {
  externalPostingId: string;
  externalUrl?: string;
}

export interface JobBoardProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly description: string;
  publish(config: Record<string, unknown>, payload: JobPostPayload): Promise<ProviderPostResult>;
  withdraw(config: Record<string, unknown>, externalPostingId: string): Promise<void>;
  getStatus(config: Record<string, unknown>, externalPostingId: string): Promise<{ status: string; expiresAt?: string }>;
}

// =============================================================================
// Provider Implementations (simulated -- real HTTP calls in production)
// =============================================================================

class IndeedProvider implements JobBoardProvider {
  readonly id = "indeed";
  readonly name = "Indeed";
  readonly baseUrl = "https://www.indeed.co.uk";
  readonly description = "UK's largest job board";

  async publish(_config: Record<string, unknown>, _payload: JobPostPayload): Promise<ProviderPostResult> {
    const externalId = `IND-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { externalPostingId: externalId, externalUrl: `${this.baseUrl}/viewjob?jk=${externalId}` };
  }
  async withdraw(_config: Record<string, unknown>, _externalPostingId: string): Promise<void> {}
  async getStatus(_config: Record<string, unknown>, _externalPostingId: string): Promise<{ status: string }> {
    return { status: "active" };
  }
}

class LinkedInProvider implements JobBoardProvider {
  readonly id = "linkedin";
  readonly name = "LinkedIn";
  readonly baseUrl = "https://www.linkedin.com/jobs";
  readonly description = "Professional networking and job board";

  async publish(_config: Record<string, unknown>, _payload: JobPostPayload): Promise<ProviderPostResult> {
    const externalId = `LI-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { externalPostingId: externalId, externalUrl: `${this.baseUrl}/view/${externalId}` };
  }
  async withdraw(_config: Record<string, unknown>, _externalPostingId: string): Promise<void> {}
  async getStatus(_config: Record<string, unknown>, _externalPostingId: string): Promise<{ status: string }> {
    return { status: "active" };
  }
}

class ReedProvider implements JobBoardProvider {
  readonly id = "reed";
  readonly name = "Reed";
  readonly baseUrl = "https://www.reed.co.uk";
  readonly description = "UK recruitment job board";

  async publish(_config: Record<string, unknown>, _payload: JobPostPayload): Promise<ProviderPostResult> {
    const externalId = `REED-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { externalPostingId: externalId, externalUrl: `${this.baseUrl}/jobs/${externalId}` };
  }
  async withdraw(_config: Record<string, unknown>, _externalPostingId: string): Promise<void> {}
  async getStatus(_config: Record<string, unknown>, _externalPostingId: string): Promise<{ status: string }> {
    return { status: "active" };
  }
}

class TotaljobsProvider implements JobBoardProvider {
  readonly id = "totaljobs";
  readonly name = "Totaljobs";
  readonly baseUrl = "https://www.totaljobs.com";
  readonly description = "UK job board (Stepstone Group)";

  async publish(_config: Record<string, unknown>, _payload: JobPostPayload): Promise<ProviderPostResult> {
    const externalId = `TJ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { externalPostingId: externalId, externalUrl: `${this.baseUrl}/job/${externalId}` };
  }
  async withdraw(_config: Record<string, unknown>, _externalPostingId: string): Promise<void> {}
  async getStatus(_config: Record<string, unknown>, _externalPostingId: string): Promise<{ status: string }> {
    return { status: "active" };
  }
}

class CWJobsProvider implements JobBoardProvider {
  readonly id = "cwjobs";
  readonly name = "CWJobs";
  readonly baseUrl = "https://www.cwjobs.co.uk";
  readonly description = "UK IT and technology job board (Stepstone Group)";

  async publish(_config: Record<string, unknown>, _payload: JobPostPayload): Promise<ProviderPostResult> {
    const externalId = `CW-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { externalPostingId: externalId, externalUrl: `${this.baseUrl}/job/${externalId}` };
  }
  async withdraw(_config: Record<string, unknown>, _externalPostingId: string): Promise<void> {}
  async getStatus(_config: Record<string, unknown>, _externalPostingId: string): Promise<{ status: string }> {
    return { status: "active" };
  }
}

// =============================================================================
// Provider Registry
// =============================================================================

const PROVIDERS: Record<string, JobBoardProvider> = {
  indeed: new IndeedProvider(),
  linkedin: new LinkedInProvider(),
  reed: new ReedProvider(),
  totaljobs: new TotaljobsProvider(),
  cwjobs: new CWJobsProvider(),
};

export const SUPPORTED_BOARDS = Object.fromEntries(
  Object.values(PROVIDERS).map((p) => [
    p.id,
    { name: p.name, baseUrl: p.baseUrl, description: p.description },
  ])
) as Record<string, { name: string; baseUrl: string; description: string }>;

// =============================================================================
// Service
// =============================================================================

export class JobBoardsService {
  private repository: JobBoardsRepository;

  constructor(private db: DatabaseClient) {
    this.repository = new JobBoardsRepository(db);
  }

  // ===========================================================================
  // Integration Management
  // ===========================================================================

  async listIntegrations(ctx: TenantContext, options: { cursor?: string; limit?: number; provider?: string } = {}) {
    const result = await this.repository.listIntegrations(ctx, options);
    return { ...result, items: result.items.map((i) => this.redactIntegrationConfig(i)) };
  }

  async getIntegration(ctx: TenantContext, id: string): Promise<JobBoardIntegration | null> {
    const integration = await this.repository.getIntegrationById(ctx, id);
    return integration ? this.redactIntegrationConfig(integration) : null;
  }

  async createIntegration(
    ctx: TenantContext,
    data: { provider: string; config: Record<string, unknown>; enabled?: boolean; displayName?: string }
  ): Promise<JobBoardIntegration> {
    if (!PROVIDERS[data.provider]) {
      throw new Error(`Unsupported provider: ${data.provider}. Supported: ${Object.keys(PROVIDERS).join(", ")}`);
    }
    const existing = await this.repository.getIntegrationByProvider(ctx, data.provider);
    if (existing) {
      throw new Error(`Integration for provider '${data.provider}' already exists (ID: ${existing.id}). Update the existing integration instead.`);
    }
    const integration = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const created = await this.repository.createIntegration(ctx, data);
      await this.emitDomainEvent(tx, ctx, "recruitment.job_board.integration_created", "job_board_integration", created.id, { provider: data.provider, enabled: data.enabled !== false });
      return created;
    });
    return this.redactIntegrationConfig(integration);
  }

  async updateIntegration(
    ctx: TenantContext, id: string,
    data: Partial<{ config: Record<string, unknown>; enabled: boolean; displayName: string | null }>
  ): Promise<JobBoardIntegration | null> {
    const existing = await this.repository.getIntegrationById(ctx, id);
    if (!existing) return null;
    const updated = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const result = await this.repository.updateIntegration(ctx, id, data);
      if (result) {
        await this.emitDomainEvent(tx, ctx, "recruitment.job_board.integration_updated", "job_board_integration", id, { provider: existing.provider, changes: Object.keys(data) });
      }
      return result;
    });
    return updated ? this.redactIntegrationConfig(updated) : null;
  }

  async deleteIntegration(ctx: TenantContext, id: string): Promise<boolean> {
    const existing = await this.repository.getIntegrationById(ctx, id);
    if (!existing) return false;
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const deleted = await this.repository.deleteIntegration(ctx, id);
      if (deleted) {
        await this.emitDomainEvent(tx, ctx, "recruitment.job_board.integration_deleted", "job_board_integration", id, { provider: existing.provider });
      }
      return deleted;
    });
  }

  // ===========================================================================
  // Publish a vacancy to a single job board
  // ===========================================================================

  async publishToBoard(
    ctx: TenantContext,
    data: { vacancyId: string; boardName: string; integrationId?: string; applicationUrl?: string; expiresAt?: string }
  ): Promise<JobBoardPosting> {
    const provider = PROVIDERS[data.boardName];
    if (!provider) {
      throw new Error(`Unsupported job board: ${data.boardName}. Supported boards: ${Object.keys(PROVIDERS).join(", ")}`);
    }
    const requisition = await this.getRequisition(ctx, data.vacancyId);
    if (!requisition) throw new Error("Requisition not found");
    if (requisition.status !== "open") {
      throw new Error(`Requisition must be in 'open' status to post to job boards, current status: '${requisition.status}'`);
    }
    const existing = await this.repository.getPostingByVacancyAndBoard(ctx, data.vacancyId, data.boardName);
    if (existing && (existing.status === "posted" || existing.status === "draft")) {
      throw new Error(`Requisition is already posted to ${data.boardName} (posting ID: ${existing.id}, status: ${existing.status})`);
    }
    let integrationConfig: Record<string, unknown> = {};
    if (data.integrationId) {
      const integration = await this.repository.getIntegrationById(ctx, data.integrationId);
      if (!integration) throw new Error("Integration not found");
      if (!integration.enabled) throw new Error(`Integration for '${integration.provider}' is disabled`);
      if (integration.provider !== data.boardName) {
        throw new Error(`Integration provider '${integration.provider}' does not match board '${data.boardName}'`);
      }
      integrationConfig = integration.config;
    }
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const posting = await this.repository.createPosting(ctx, { vacancyId: data.vacancyId, boardName: data.boardName, integrationId: data.integrationId, applicationUrl: data.applicationUrl, expiresAt: data.expiresAt });
      const providerResult = await provider.publish(integrationConfig, { title: requisition.title, description: requisition.jobDescription || "", location: requisition.location, applicationUrl: data.applicationUrl, expiresAt: data.expiresAt });
      await this.repository.updateExternalPostingId(ctx, posting.id, providerResult.externalPostingId);
      await this.repository.updateBoardJobId(ctx, posting.id, providerResult.externalPostingId);
      await this.emitDomainEvent(tx, ctx, "recruitment.job_board.posted", "job_board_posting", posting.id, {
        posting: { ...posting, external_posting_id: providerResult.externalPostingId, board_job_id: providerResult.externalPostingId },
        vacancyId: data.vacancyId, boardName: data.boardName, externalUrl: providerResult.externalUrl,
      });
      return { ...posting, external_posting_id: providerResult.externalPostingId, board_job_id: providerResult.externalPostingId, status: "posted" as const };
    });
  }

  // ===========================================================================
  // Post a job to multiple selected boards at once
  // ===========================================================================

  async postToMultipleBoards(
    ctx: TenantContext, vacancyId: string,
    boards: Array<{ provider: string; integrationId?: string; applicationUrl?: string; expiresAt?: string }>
  ): Promise<{ results: Array<{ provider: string; success: boolean; posting?: JobBoardPosting; error?: string }>; successCount: number; failureCount: number }> {
    const requisition = await this.getRequisition(ctx, vacancyId);
    if (!requisition) throw new Error("Requisition not found");
    if (requisition.status !== "open") {
      throw new Error(`Requisition must be in 'open' status to post to job boards, current status: '${requisition.status}'`);
    }
    const results: Array<{ provider: string; success: boolean; posting?: JobBoardPosting; error?: string }> = [];
    for (const board of boards) {
      try {
        const posting = await this.publishToBoard(ctx, { vacancyId, boardName: board.provider, integrationId: board.integrationId, applicationUrl: board.applicationUrl, expiresAt: board.expiresAt });
        results.push({ provider: board.provider, success: true, posting });
      } catch (err: any) {
        results.push({ provider: board.provider, success: false, error: err.message });
      }
    }
    return { results, successCount: results.filter((r) => r.success).length, failureCount: results.filter((r) => !r.success).length };
  }

  // ===========================================================================
  // Get / List / Withdraw / Remove
  // ===========================================================================

  async getPosting(ctx: TenantContext, id: string): Promise<JobBoardPosting | null> {
    return this.repository.getPostingById(ctx, id);
  }

  async listPostings(ctx: TenantContext, options: { cursor?: string; limit?: number; vacancyId?: string; boardName?: string; status?: string } = {}) {
    return this.repository.listPostings(ctx, options);
  }

  async withdrawPosting(ctx: TenantContext, id: string): Promise<boolean> {
    const posting = await this.repository.getPostingById(ctx, id);
    if (!posting) return false;
    if (posting.status === "withdrawn" || posting.status === "removed") {
      throw new Error("Posting has already been withdrawn");
    }
    const provider = PROVIDERS[posting.board_name];
    if (provider && posting.external_posting_id) {
      let integrationConfig: Record<string, unknown> = {};
      if (posting.integration_id) {
        const integration = await this.repository.getIntegrationById(ctx, posting.integration_id);
        if (integration) integrationConfig = integration.config;
      }
      try { await provider.withdraw(integrationConfig, posting.external_posting_id); } catch { /* log but continue */ }
    }
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      await this.repository.updatePostingStatus(ctx, id, "withdrawn", ctx.userId);
      await this.emitDomainEvent(tx, ctx, "recruitment.job_board.withdrawn", "job_board_posting", id, { posting, boardName: posting.board_name, vacancyId: posting.vacancy_id });
      return true;
    });
  }

  async removePosting(ctx: TenantContext, id: string): Promise<boolean> {
    const posting = await this.repository.getPostingById(ctx, id);
    if (!posting) return false;
    if (posting.status === "removed") throw new Error("Posting has already been removed");
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      await this.repository.updatePostingStatus(ctx, id, "removed", ctx.userId);
      await this.emitDomainEvent(tx, ctx, "recruitment.job_board.removed", "job_board_posting", id, { posting, boardName: posting.board_name, vacancyId: posting.vacancy_id });
      return true;
    });
  }

  // ===========================================================================
  // Metadata
  // ===========================================================================

  getSupportedBoards() {
    return Object.values(PROVIDERS).map((p) => ({ id: p.id, name: p.name, baseUrl: p.baseUrl, description: p.description }));
  }

  getProvider(name: string): JobBoardProvider | undefined {
    return PROVIDERS[name];
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private redactIntegrationConfig(integration: JobBoardIntegration): JobBoardIntegration {
    const redacted: Record<string, unknown> = {};
    for (const key of Object.keys(integration.config)) { redacted[key] = "***"; }
    return { ...integration, config: redacted };
  }

  private async getRequisition(ctx: TenantContext, id: string): Promise<{ id: string; status: string; title: string; jobDescription?: string; location?: string } | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ id: string; status: string; title: string; jobDescription?: string; location?: string }[]>`
        SELECT id, status, title, job_description, location FROM app.requisitions WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  private async emitDomainEvent(tx: TransactionSql, ctx: TenantContext, eventType: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
      VALUES (gen_random_uuid(), ${ctx.tenantId}::uuid, ${aggregateType}, ${aggregateId}::uuid, ${eventType}, ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb, now())
    `;
  }
}
