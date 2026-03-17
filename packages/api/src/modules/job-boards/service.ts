/**
 * Job Boards Service
 *
 * Business logic for publishing vacancies to external job boards.
 * Validates requisition state, prevents duplicate postings, and
 * emits domain events for the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { JobBoardsRepository, type TenantContext, type JobBoardPosting } from "./repository";

// =============================================================================
// Supported board metadata (UK-focused boards)
// =============================================================================

export const SUPPORTED_BOARDS = {
  indeed: {
    name: "Indeed",
    baseUrl: "https://www.indeed.co.uk",
    description: "UK's largest job board",
  },
  linkedin: {
    name: "LinkedIn",
    baseUrl: "https://www.linkedin.com/jobs",
    description: "Professional networking and job board",
  },
  reed: {
    name: "Reed",
    baseUrl: "https://www.reed.co.uk",
    description: "UK recruitment job board",
  },
  totaljobs: {
    name: "Totaljobs",
    baseUrl: "https://www.totaljobs.com",
    description: "UK job board (Stepstone Group)",
  },
} as const;

// =============================================================================
// Service
// =============================================================================

export class JobBoardsService {
  private repository: JobBoardsRepository;

  constructor(private db: DatabaseClient) {
    this.repository = new JobBoardsRepository(db);
  }

  // ---------------------------------------------------------------------------
  // Publish a vacancy to a job board
  // ---------------------------------------------------------------------------

  async publishToBoard(
    ctx: TenantContext,
    data: {
      vacancyId: string;
      boardName: string;
      applicationUrl?: string;
      expiresAt?: string;
    }
  ): Promise<JobBoardPosting> {
    // 1. Validate the board name is supported
    if (!SUPPORTED_BOARDS[data.boardName as keyof typeof SUPPORTED_BOARDS]) {
      throw new Error(`Unsupported job board: ${data.boardName}. Supported boards: ${Object.keys(SUPPORTED_BOARDS).join(", ")}`);
    }

    // 2. Verify requisition exists and is in a postable state (open)
    const requisition = await this.getRequisition(ctx, data.vacancyId);
    if (!requisition) {
      throw new Error("Requisition not found");
    }
    if (requisition.status !== "open") {
      throw new Error(`Requisition must be in 'open' status to post to job boards, current status: '${requisition.status}'`);
    }

    // 3. Check for existing active posting on the same board
    const existing = await this.repository.getPostingByVacancyAndBoard(
      ctx,
      data.vacancyId,
      data.boardName
    );
    if (existing && (existing.status === "posted" || existing.status === "draft")) {
      throw new Error(
        `Requisition is already posted to ${data.boardName} (posting ID: ${existing.id}, status: ${existing.status})`
      );
    }

    // 4. Create the posting and emit domain event atomically
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const posting = await this.repository.createPosting(ctx, data);

      // Generate a simulated board_job_id (in production this would come from
      // the board's API callback, but we generate a placeholder for tracking)
      const boardJobId = `${data.boardName.toUpperCase()}-${Date.now().toString(36)}`;
      await this.repository.updateBoardJobId(ctx, posting.id, boardJobId);

      // Emit domain event
      await this.emitDomainEvent(
        tx,
        ctx,
        "recruitment.job_board.posted",
        "job_board_posting",
        posting.id,
        {
          posting: { ...posting, board_job_id: boardJobId },
          vacancyId: data.vacancyId,
          boardName: data.boardName,
        }
      );

      // Return the full posting with board_job_id set
      return { ...posting, board_job_id: boardJobId, status: "posted" as const };
    });
  }

  // ---------------------------------------------------------------------------
  // Get posting status
  // ---------------------------------------------------------------------------

  async getPosting(ctx: TenantContext, id: string): Promise<JobBoardPosting | null> {
    return this.repository.getPostingById(ctx, id);
  }

  // ---------------------------------------------------------------------------
  // List postings with filters
  // ---------------------------------------------------------------------------

  async listPostings(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      vacancyId?: string;
      boardName?: string;
      status?: string;
    } = {}
  ) {
    return this.repository.listPostings(ctx, options);
  }

  // ---------------------------------------------------------------------------
  // Remove a posting from a job board
  // ---------------------------------------------------------------------------

  async removePosting(ctx: TenantContext, id: string): Promise<boolean> {
    const posting = await this.repository.getPostingById(ctx, id);
    if (!posting) {
      return false;
    }

    if (posting.status === "removed") {
      throw new Error("Posting has already been removed");
    }

    // Mark as removed (soft-delete via status change) and emit event
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      await this.repository.updatePostingStatus(ctx, id, "removed", ctx.userId);

      await this.emitDomainEvent(
        tx,
        ctx,
        "recruitment.job_board.removed",
        "job_board_posting",
        id,
        {
          posting,
          boardName: posting.board_name,
          vacancyId: posting.vacancy_id,
        }
      );

      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Get supported boards metadata
  // ---------------------------------------------------------------------------

  getSupportedBoards() {
    return Object.entries(SUPPORTED_BOARDS).map(([key, value]) => ({
      id: key,
      ...value,
    }));
  }

  // ---------------------------------------------------------------------------
  // Helper: fetch requisition (uses the requisitions table directly)
  // ---------------------------------------------------------------------------

  private async getRequisition(
    ctx: TenantContext,
    id: string
  ): Promise<{ id: string; status: string; title: string } | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ id: string; status: string; title: string }[]>`
        SELECT id, status, title
        FROM app.requisitions
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  // ---------------------------------------------------------------------------
  // Helper: emit domain event into outbox
  // ---------------------------------------------------------------------------

  private async emitDomainEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }
}
