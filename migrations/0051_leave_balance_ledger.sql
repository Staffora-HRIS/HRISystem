-- Migration: 0051_leave_balance_ledger
-- Created: 2026-01-07
-- Description: Create the leave_balance_ledger table - THE SOURCE OF TRUTH for all balance changes
--              This is an APPEND-ONLY audit log of every balance modification
--              CRITICAL: The leave_balances table is derived from this ledger
--              NO UPDATES OR DELETES are allowed - corrections are new entries
--              This design ensures complete auditability and point-in-time balance reconstruction

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leave Balance Ledger Table
-- -----------------------------------------------------------------------------
-- Append-only transaction log for all balance changes
-- Every credit, debit, adjustment, carryover, and forfeiture is recorded here
-- Balance reconstruction: SUM(amount) WHERE effective_date <= target_date
CREATE TABLE IF NOT EXISTS app.leave_balance_ledger (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this transaction
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee whose balance is affected
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- The leave type being modified
    leave_type_id uuid NOT NULL REFERENCES app.leave_types(id) ON DELETE RESTRICT,

    -- Reference to the balance record (for quick lookups)
    -- Can be NULL if balance record doesn't exist yet
    balance_id uuid REFERENCES app.leave_balances(id) ON DELETE SET NULL,

    -- ==========================================================================
    -- TRANSACTION DETAILS
    -- ==========================================================================

    -- Type of transaction (determines which balance component to update)
    -- accrual: Regular entitlement accrual (credits accrued)
    -- used: Leave taken (debits used)
    -- adjustment: Manual correction by HR (credits/debits adjustments)
    -- carryover: Balance from previous year (credits carryover)
    -- forfeited: Expired/lost balance (debits forfeited)
    -- encashment: Converted to cash (debits used or separate tracking)
    transaction_type app.balance_transaction_type NOT NULL,

    -- Amount of the transaction
    -- POSITIVE values = credits (increases balance)
    -- NEGATIVE values = debits (decreases balance)
    -- Examples:
    --   accrual: +1.67 days (monthly accrual)
    --   used: -5.0 days (5 day vacation)
    --   adjustment: +2.0 days (correction) or -1.0 days (deduction)
    --   carryover: +5.0 days (from last year)
    --   forfeited: -3.0 days (expired carryover)
    amount numeric(8,2) NOT NULL,

    -- Running balance after this transaction (for quick balance queries)
    -- Calculated when transaction is inserted
    running_balance numeric(8,2),

    -- ==========================================================================
    -- REFERENCE/LINKAGE
    -- ==========================================================================

    -- Type of entity that caused this transaction
    -- leave_request: Approved leave request caused debit
    -- accrual_run: Scheduled accrual batch job
    -- carryover_run: Year-end carryover process
    -- manual: Manual adjustment by HR
    -- policy_change: Policy modification required balance update
    -- opening: Opening balance entry
    reference_type varchar(50),

    -- ID of the referenced entity (leave_request.id, accrual_run_id, etc.)
    reference_id uuid,

    -- ==========================================================================
    -- EFFECTIVE DATE
    -- ==========================================================================

    -- Date when this transaction takes effect
    -- Used for point-in-time balance queries
    -- For leave usage: typically the first day of leave
    -- For accruals: the accrual period end date
    -- For carryover: January 1 of the new year
    effective_date date NOT NULL,

    -- ==========================================================================
    -- DOCUMENTATION
    -- ==========================================================================

    -- Notes/explanation for this transaction
    -- Required for adjustments, optional for others
    notes text,

    -- ==========================================================================
    -- AUDIT FIELDS
    -- ==========================================================================

    -- Timestamp when transaction was recorded
    -- This is immutable (no updates allowed)
    created_at timestamptz NOT NULL DEFAULT now(),

    -- User who created this transaction
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- ==========================================================================
    -- CONSTRAINTS
    -- ==========================================================================

    -- Effective date must be reasonable
    CONSTRAINT leave_balance_ledger_date_check CHECK (
        effective_date >= '1970-01-01' AND effective_date <= '2100-12-31'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary query path: employee's transactions for a leave type and date range
-- This is crucial for balance reconstruction
CREATE INDEX IF NOT EXISTS idx_leave_ledger_employee_type_date
    ON app.leave_balance_ledger(tenant_id, employee_id, leave_type_id, effective_date);

-- Balance reference (for quick updates to balance table)
CREATE INDEX IF NOT EXISTS idx_leave_ledger_balance
    ON app.leave_balance_ledger(balance_id)
    WHERE balance_id IS NOT NULL;

-- Reference lookup (find transactions for a leave request)
CREATE INDEX IF NOT EXISTS idx_leave_ledger_reference
    ON app.leave_balance_ledger(tenant_id, reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

-- Transaction type filtering (for reports)
CREATE INDEX IF NOT EXISTS idx_leave_ledger_tenant_type
    ON app.leave_balance_ledger(tenant_id, transaction_type, effective_date);

-- Audit trail: transactions by creator
CREATE INDEX IF NOT EXISTS idx_leave_ledger_created_by
    ON app.leave_balance_ledger(created_by, created_at)
    WHERE created_by IS NOT NULL;

-- Date range queries (for period reports)
CREATE INDEX IF NOT EXISTS idx_leave_ledger_effective_date
    ON app.leave_balance_ledger(tenant_id, effective_date);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.leave_balance_ledger ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see ledger entries for their current tenant
CREATE POLICY tenant_isolation ON app.leave_balance_ledger
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.leave_balance_ledger
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- CRITICAL: Prevent Updates and Deletes
-- =============================================================================

-- This is an append-only ledger - no updates or deletes allowed
-- Corrections should be made by adding new compensating entries

CREATE OR REPLACE FUNCTION app.prevent_ledger_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RAISE EXCEPTION 'Leave balance ledger is append-only. Updates and deletes are not allowed. Create a new compensating entry instead.';
    RETURN NULL;
END;
$$;

CREATE TRIGGER prevent_ledger_update
    BEFORE UPDATE ON app.leave_balance_ledger
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_ledger_modification();

CREATE TRIGGER prevent_ledger_delete
    BEFORE DELETE ON app.leave_balance_ledger
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_ledger_modification();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to record a ledger entry and update the corresponding balance
-- This is the ONLY way to modify leave balances
CREATE OR REPLACE FUNCTION app.record_balance_transaction(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_transaction_type app.balance_transaction_type,
    p_amount numeric,
    p_effective_date date,
    p_reference_type varchar(50) DEFAULT NULL,
    p_reference_id uuid DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_year integer;
    v_balance_id uuid;
    v_ledger_id uuid;
    v_running_balance numeric;
BEGIN
    -- Determine the year from effective date
    v_year := EXTRACT(YEAR FROM p_effective_date)::integer;

    -- Ensure balance record exists
    v_balance_id := app.ensure_leave_balance(p_tenant_id, p_employee_id, p_leave_type_id, v_year);

    -- Calculate running balance (sum of all prior transactions + this one)
    SELECT COALESCE(SUM(amount), 0) + p_amount INTO v_running_balance
    FROM app.leave_balance_ledger
    WHERE tenant_id = p_tenant_id
      AND employee_id = p_employee_id
      AND leave_type_id = p_leave_type_id
      AND effective_date <= p_effective_date;

    -- Insert ledger entry
    INSERT INTO app.leave_balance_ledger (
        tenant_id,
        employee_id,
        leave_type_id,
        balance_id,
        transaction_type,
        amount,
        running_balance,
        reference_type,
        reference_id,
        effective_date,
        notes,
        created_by
    ) VALUES (
        p_tenant_id,
        p_employee_id,
        p_leave_type_id,
        v_balance_id,
        p_transaction_type,
        p_amount,
        v_running_balance,
        p_reference_type,
        p_reference_id,
        p_effective_date,
        p_notes,
        p_created_by
    )
    RETURNING id INTO v_ledger_id;

    -- Update balance record based on transaction type
    UPDATE app.leave_balances
    SET
        accrued = CASE WHEN p_transaction_type = 'accrual' THEN accrued + p_amount ELSE accrued END,
        used = CASE WHEN p_transaction_type = 'used' THEN used + ABS(p_amount) ELSE used END,
        adjustments = CASE WHEN p_transaction_type = 'adjustment' THEN adjustments + p_amount ELSE adjustments END,
        carryover = CASE WHEN p_transaction_type = 'carryover' THEN carryover + p_amount ELSE carryover END,
        forfeited = CASE WHEN p_transaction_type = 'forfeited' THEN forfeited + ABS(p_amount) ELSE forfeited END,
        last_accrual_date = CASE WHEN p_transaction_type = 'accrual' THEN p_effective_date ELSE last_accrual_date END,
        updated_at = now()
    WHERE id = v_balance_id;

    RETURN v_ledger_id;
END;
$$;

-- Function to record pending balance reservation (for submitted requests)
-- Pending amounts are tracked separately and don't create ledger entries
CREATE OR REPLACE FUNCTION app.reserve_pending_balance(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_amount numeric,
    p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_balance_id uuid;
BEGIN
    -- Ensure balance record exists
    v_balance_id := app.ensure_leave_balance(p_tenant_id, p_employee_id, p_leave_type_id, p_year);

    -- Update pending amount
    UPDATE app.leave_balances
    SET pending = pending + p_amount,
        updated_at = now()
    WHERE id = v_balance_id;

    RETURN true;
END;
$$;

-- Function to release pending balance reservation (for rejected/cancelled requests)
CREATE OR REPLACE FUNCTION app.release_pending_balance(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_amount numeric,
    p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Update pending amount
    UPDATE app.leave_balances
    SET pending = GREATEST(pending - p_amount, 0),
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND employee_id = p_employee_id
      AND leave_type_id = p_leave_type_id
      AND year = p_year;

    RETURN true;
END;
$$;

-- Function to convert pending to used (when request is approved)
-- This releases pending and creates a 'used' ledger entry
CREATE OR REPLACE FUNCTION app.confirm_leave_usage(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_amount numeric,
    p_effective_date date,
    p_reference_id uuid,
    p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_year integer;
    v_ledger_id uuid;
BEGIN
    v_year := EXTRACT(YEAR FROM p_effective_date)::integer;

    -- Release the pending reservation
    PERFORM app.release_pending_balance(p_tenant_id, p_employee_id, p_leave_type_id, p_amount, v_year);

    -- Record the usage in the ledger (negative amount for debit)
    v_ledger_id := app.record_balance_transaction(
        p_tenant_id,
        p_employee_id,
        p_leave_type_id,
        'used'::app.balance_transaction_type,
        -ABS(p_amount),  -- Always negative for usage
        p_effective_date,
        'leave_request',
        p_reference_id,
        'Approved leave request',
        p_created_by
    );

    RETURN v_ledger_id;
END;
$$;

-- Function to reverse a leave usage (when approved request is cancelled)
-- Creates a compensating entry to restore the balance
CREATE OR REPLACE FUNCTION app.reverse_leave_usage(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_amount numeric,
    p_original_effective_date date,
    p_reference_id uuid,
    p_reason text,
    p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_ledger_id uuid;
BEGIN
    -- Record a compensating adjustment (positive to restore balance)
    v_ledger_id := app.record_balance_transaction(
        p_tenant_id,
        p_employee_id,
        p_leave_type_id,
        'adjustment'::app.balance_transaction_type,
        ABS(p_amount),  -- Positive to restore balance
        CURRENT_DATE,   -- Reversal effective today
        'leave_request_cancellation',
        p_reference_id,
        COALESCE(p_reason, 'Leave request cancelled - balance restored'),
        p_created_by
    );

    RETURN v_ledger_id;
END;
$$;

-- Function to reconstruct balance at a point in time from ledger
CREATE OR REPLACE FUNCTION app.get_balance_at_date(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_as_of_date date
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_balance numeric;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM app.leave_balance_ledger
    WHERE tenant_id = p_tenant_id
      AND employee_id = p_employee_id
      AND leave_type_id = p_leave_type_id
      AND effective_date <= p_as_of_date;

    RETURN v_balance;
END;
$$;

-- Function to get ledger entries for an employee/leave type
CREATE OR REPLACE FUNCTION app.get_balance_ledger_entries(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    transaction_type app.balance_transaction_type,
    amount numeric(8,2),
    running_balance numeric(8,2),
    effective_date date,
    reference_type varchar(50),
    reference_id uuid,
    notes text,
    created_at timestamptz,
    created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.transaction_type,
        l.amount,
        l.running_balance,
        l.effective_date,
        l.reference_type,
        l.reference_id,
        l.notes,
        l.created_at,
        l.created_by
    FROM app.leave_balance_ledger l
    WHERE l.tenant_id = p_tenant_id
      AND l.employee_id = p_employee_id
      AND l.leave_type_id = p_leave_type_id
      AND (p_start_date IS NULL OR l.effective_date >= p_start_date)
      AND (p_end_date IS NULL OR l.effective_date <= p_end_date)
    ORDER BY l.effective_date DESC, l.created_at DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.leave_balance_ledger IS 'Append-only transaction ledger for all balance changes. THE SOURCE OF TRUTH.';
COMMENT ON COLUMN app.leave_balance_ledger.id IS 'Primary UUID identifier for the ledger entry';
COMMENT ON COLUMN app.leave_balance_ledger.tenant_id IS 'Tenant that owns this transaction';
COMMENT ON COLUMN app.leave_balance_ledger.employee_id IS 'Employee whose balance is affected';
COMMENT ON COLUMN app.leave_balance_ledger.leave_type_id IS 'Leave type being modified';
COMMENT ON COLUMN app.leave_balance_ledger.balance_id IS 'Reference to the balance record';
COMMENT ON COLUMN app.leave_balance_ledger.transaction_type IS 'Type: accrual, used, adjustment, carryover, forfeited, encashment';
COMMENT ON COLUMN app.leave_balance_ledger.amount IS 'Transaction amount (positive=credit, negative=debit)';
COMMENT ON COLUMN app.leave_balance_ledger.running_balance IS 'Balance after this transaction';
COMMENT ON COLUMN app.leave_balance_ledger.reference_type IS 'Type of entity that caused this transaction';
COMMENT ON COLUMN app.leave_balance_ledger.reference_id IS 'ID of the referenced entity';
COMMENT ON COLUMN app.leave_balance_ledger.effective_date IS 'Date when transaction takes effect';
COMMENT ON COLUMN app.leave_balance_ledger.notes IS 'Explanation/documentation for this transaction';
COMMENT ON COLUMN app.leave_balance_ledger.created_at IS 'Timestamp when recorded (immutable)';
COMMENT ON COLUMN app.leave_balance_ledger.created_by IS 'User who created this transaction';
COMMENT ON FUNCTION app.prevent_ledger_modification IS 'Prevents updates/deletes on append-only ledger';
COMMENT ON FUNCTION app.record_balance_transaction IS 'Records a ledger entry and updates balance - THE ONLY way to modify balances';
COMMENT ON FUNCTION app.reserve_pending_balance IS 'Reserves balance for pending request (no ledger entry)';
COMMENT ON FUNCTION app.release_pending_balance IS 'Releases pending reservation';
COMMENT ON FUNCTION app.confirm_leave_usage IS 'Converts pending to used when request approved';
COMMENT ON FUNCTION app.reverse_leave_usage IS 'Restores balance when approved request cancelled';
COMMENT ON FUNCTION app.get_balance_at_date IS 'Reconstructs balance at a point in time from ledger';
COMMENT ON FUNCTION app.get_balance_ledger_entries IS 'Returns ledger entries for audit trail';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_balance_ledger_entries(uuid, uuid, uuid, date, date, integer);
-- DROP FUNCTION IF EXISTS app.get_balance_at_date(uuid, uuid, uuid, date);
-- DROP FUNCTION IF EXISTS app.reverse_leave_usage(uuid, uuid, uuid, numeric, date, uuid, text, uuid);
-- DROP FUNCTION IF EXISTS app.confirm_leave_usage(uuid, uuid, uuid, numeric, date, uuid, uuid);
-- DROP FUNCTION IF EXISTS app.release_pending_balance(uuid, uuid, uuid, numeric, integer);
-- DROP FUNCTION IF EXISTS app.reserve_pending_balance(uuid, uuid, uuid, numeric, integer);
-- DROP FUNCTION IF EXISTS app.record_balance_transaction(uuid, uuid, uuid, app.balance_transaction_type, numeric, date, varchar, uuid, text, uuid);
-- DROP TRIGGER IF EXISTS prevent_ledger_delete ON app.leave_balance_ledger;
-- DROP TRIGGER IF EXISTS prevent_ledger_update ON app.leave_balance_ledger;
-- DROP FUNCTION IF EXISTS app.prevent_ledger_modification();
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.leave_balance_ledger;
-- DROP POLICY IF EXISTS tenant_isolation ON app.leave_balance_ledger;
-- DROP INDEX IF EXISTS app.idx_leave_ledger_effective_date;
-- DROP INDEX IF EXISTS app.idx_leave_ledger_created_by;
-- DROP INDEX IF EXISTS app.idx_leave_ledger_tenant_type;
-- DROP INDEX IF EXISTS app.idx_leave_ledger_reference;
-- DROP INDEX IF EXISTS app.idx_leave_ledger_balance;
-- DROP INDEX IF EXISTS app.idx_leave_ledger_employee_type_date;
-- DROP TABLE IF EXISTS app.leave_balance_ledger;
