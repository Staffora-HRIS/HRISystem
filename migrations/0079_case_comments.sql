-- Migration: 0079_case_comments
-- Created: 2026-01-07
-- Description: Create the case_comments table - case discussion and updates
--              This table stores comments, replies, and status updates on cases
--              Supports internal vs. public comments and rich text content

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Case Comments Table
-- -----------------------------------------------------------------------------
-- Comments, updates, and replies on cases
-- Supports threaded replies and internal/public visibility
CREATE TABLE IF NOT EXISTS app.case_comments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this comment exists
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Case this comment belongs to
    case_id uuid NOT NULL REFERENCES app.cases(id) ON DELETE CASCADE,

    -- Author of the comment
    author_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Parent comment for threading (NULL for top-level comments)
    parent_id uuid REFERENCES app.case_comments(id) ON DELETE CASCADE,

    -- Comment content
    content text NOT NULL,

    -- Rich content (for formatted text, mentions, etc.)
    -- Structure: {
    --   "format": "markdown" | "html" | "plain",
    --   "mentions": [{"user_id": "uuid", "position": 10}],
    --   "attachments": ["attachment_id1", "attachment_id2"]
    -- }
    rich_content jsonb,

    -- Visibility
    is_internal boolean NOT NULL DEFAULT false,

    -- Comment type
    -- Structure determines the purpose of the comment
    comment_type varchar(50) NOT NULL DEFAULT 'comment',
    -- Valid types: comment, status_change, assignment_change, escalation, resolution, system

    -- Status change metadata (when comment_type = 'status_change')
    -- Structure: {
    --   "from_status": "open",
    --   "to_status": "pending",
    --   "reason": "Awaiting employee response"
    -- }
    status_change jsonb,

    -- Mentioned users (for notifications)
    mentioned_user_ids jsonb NOT NULL DEFAULT '[]',

    -- Edited flag
    is_edited boolean NOT NULL DEFAULT false,
    edited_at timestamptz,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Content must not be empty
    CONSTRAINT case_comments_content_not_empty CHECK (
        length(trim(content)) > 0
    ),

    -- Edited timestamp required when edited
    CONSTRAINT case_comments_edited_has_timestamp CHECK (
        NOT is_edited OR edited_at IS NOT NULL
    ),

    -- Status change metadata required for status_change type
    CONSTRAINT case_comments_status_change_has_metadata CHECK (
        comment_type != 'status_change' OR status_change IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Case comments (chronological)
CREATE INDEX IF NOT EXISTS idx_case_comments_case_created
    ON app.case_comments(case_id, created_at ASC);

-- Public comments only
CREATE INDEX IF NOT EXISTS idx_case_comments_case_public
    ON app.case_comments(case_id, created_at ASC)
    WHERE is_internal = false;

-- Thread replies
CREATE INDEX IF NOT EXISTS idx_case_comments_parent
    ON app.case_comments(parent_id, created_at ASC)
    WHERE parent_id IS NOT NULL;

-- Author's comments
CREATE INDEX IF NOT EXISTS idx_case_comments_author
    ON app.case_comments(author_id, created_at DESC);

-- Comment type filtering
CREATE INDEX IF NOT EXISTS idx_case_comments_case_type
    ON app.case_comments(case_id, comment_type);

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_case_comments_tenant
    ON app.case_comments(tenant_id);

-- GIN index for mentioned users
CREATE INDEX IF NOT EXISTS idx_case_comments_mentioned
    ON app.case_comments USING gin(mentioned_user_ids);

-- GIN index for rich content queries
CREATE INDEX IF NOT EXISTS idx_case_comments_rich_content
    ON app.case_comments USING gin(rich_content)
    WHERE rich_content IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.case_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see comments for their current tenant
CREATE POLICY tenant_isolation ON app.case_comments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.case_comments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Function to update case's updated_at when comment is added
CREATE OR REPLACE FUNCTION app.update_case_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.cases
    SET updated_at = now()
    WHERE id = NEW.case_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER update_case_on_comment
    AFTER INSERT ON app.case_comments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_case_on_comment();

-- Function to mark SLA response as met on first response
CREATE OR REPLACE FUNCTION app.mark_sla_response_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_requester_id uuid;
BEGIN
    -- Only for non-internal comments that are actual responses
    IF NEW.is_internal = false AND NEW.comment_type = 'comment' THEN
        -- Get the requester
        SELECT requester_id INTO v_requester_id
        FROM app.cases
        WHERE id = NEW.case_id;

        -- If comment is from someone other than requester, it's a response
        IF NEW.author_id != v_requester_id THEN
            UPDATE app.cases
            SET sla_response_met_at = COALESCE(sla_response_met_at, NEW.created_at)
            WHERE id = NEW.case_id
              AND sla_response_met_at IS NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER mark_sla_response_on_comment
    AFTER INSERT ON app.case_comments
    FOR EACH ROW
    EXECUTE FUNCTION app.mark_sla_response_on_comment();

-- Function to extract mentions from content
CREATE OR REPLACE FUNCTION app.extract_comment_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_mentions jsonb := '[]';
    v_mention_match text;
BEGIN
    -- Extract @mentions from content (pattern: @[user_id])
    -- This is a simplified example - production would use more sophisticated parsing
    FOR v_mention_match IN
        SELECT (regexp_matches(NEW.content, '@\[([0-9a-f-]{36})\]', 'g'))[1]
    LOOP
        v_mentions := v_mentions || to_jsonb(v_mention_match);
    END LOOP;

    NEW.mentioned_user_ids := v_mentions;

    RETURN NEW;
END;
$$;

CREATE TRIGGER extract_comment_mentions
    BEFORE INSERT OR UPDATE OF content ON app.case_comments
    FOR EACH ROW
    EXECUTE FUNCTION app.extract_comment_mentions();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to add a comment to a case
CREATE OR REPLACE FUNCTION app.add_case_comment(
    p_tenant_id uuid,
    p_case_id uuid,
    p_author_id uuid,
    p_content text,
    p_is_internal boolean DEFAULT false,
    p_parent_id uuid DEFAULT NULL,
    p_rich_content jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO app.case_comments (
        tenant_id,
        case_id,
        author_id,
        parent_id,
        content,
        rich_content,
        is_internal
    )
    VALUES (
        p_tenant_id,
        p_case_id,
        p_author_id,
        p_parent_id,
        p_content,
        p_rich_content,
        p_is_internal
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Function to add a status change comment
CREATE OR REPLACE FUNCTION app.add_status_change_comment(
    p_tenant_id uuid,
    p_case_id uuid,
    p_author_id uuid,
    p_from_status app.case_status,
    p_to_status app.case_status,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
    v_content text;
BEGIN
    v_content := 'Status changed from ' || p_from_status::text || ' to ' || p_to_status::text;
    IF p_reason IS NOT NULL THEN
        v_content := v_content || ': ' || p_reason;
    END IF;

    INSERT INTO app.case_comments (
        tenant_id,
        case_id,
        author_id,
        content,
        comment_type,
        status_change,
        is_internal
    )
    VALUES (
        p_tenant_id,
        p_case_id,
        p_author_id,
        v_content,
        'status_change',
        jsonb_build_object(
            'from_status', p_from_status,
            'to_status', p_to_status,
            'reason', p_reason
        ),
        false
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Function to get case comments
CREATE OR REPLACE FUNCTION app.get_case_comments(
    p_case_id uuid,
    p_include_internal boolean DEFAULT false,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    author_id uuid,
    author_type text,
    parent_id uuid,
    content text,
    rich_content jsonb,
    is_internal boolean,
    comment_type varchar(50),
    status_change jsonb,
    is_edited boolean,
    created_at timestamptz,
    reply_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.id,
        cc.author_id,
        CASE
            WHEN u.id IS NOT NULL THEN 'user'
            ELSE 'system'
        END AS author_type,
        cc.parent_id,
        cc.content,
        cc.rich_content,
        cc.is_internal,
        cc.comment_type,
        cc.status_change,
        cc.is_edited,
        cc.created_at,
        (SELECT COUNT(*) FROM app.case_comments r WHERE r.parent_id = cc.id) AS reply_count
    FROM app.case_comments cc
    LEFT JOIN app.users u ON u.id = cc.author_id
    WHERE cc.case_id = p_case_id
      AND cc.parent_id IS NULL  -- Top-level comments only
      AND (p_include_internal = true OR cc.is_internal = false)
    ORDER BY cc.created_at ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get comment replies
CREATE OR REPLACE FUNCTION app.get_comment_replies(
    p_comment_id uuid,
    p_include_internal boolean DEFAULT false
)
RETURNS TABLE (
    id uuid,
    author_id uuid,
    content text,
    rich_content jsonb,
    is_internal boolean,
    is_edited boolean,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.id,
        cc.author_id,
        cc.content,
        cc.rich_content,
        cc.is_internal,
        cc.is_edited,
        cc.created_at
    FROM app.case_comments cc
    WHERE cc.parent_id = p_comment_id
      AND (p_include_internal = true OR cc.is_internal = false)
    ORDER BY cc.created_at ASC;
END;
$$;

-- Function to edit a comment
CREATE OR REPLACE FUNCTION app.edit_case_comment(
    p_comment_id uuid,
    p_author_id uuid,
    p_new_content text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.case_comments
    SET content = p_new_content,
        is_edited = true,
        edited_at = now()
    WHERE id = p_comment_id
      AND author_id = p_author_id  -- Only author can edit
      AND comment_type = 'comment';  -- Only regular comments can be edited

    RETURN FOUND;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.case_comments IS 'Comments, updates, and replies on HR cases.';
COMMENT ON COLUMN app.case_comments.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.case_comments.tenant_id IS 'Tenant where this comment exists';
COMMENT ON COLUMN app.case_comments.case_id IS 'Case this comment belongs to';
COMMENT ON COLUMN app.case_comments.author_id IS 'User who wrote the comment';
COMMENT ON COLUMN app.case_comments.parent_id IS 'Parent comment for threading';
COMMENT ON COLUMN app.case_comments.content IS 'Comment text content';
COMMENT ON COLUMN app.case_comments.rich_content IS 'Rich content with formatting and attachments';
COMMENT ON COLUMN app.case_comments.is_internal IS 'Whether comment is internal (not visible to requester)';
COMMENT ON COLUMN app.case_comments.comment_type IS 'Type of comment (comment, status_change, etc.)';
COMMENT ON COLUMN app.case_comments.status_change IS 'Status change metadata';
COMMENT ON COLUMN app.case_comments.mentioned_user_ids IS 'Users mentioned in the comment';
COMMENT ON COLUMN app.case_comments.is_edited IS 'Whether the comment has been edited';
COMMENT ON COLUMN app.case_comments.edited_at IS 'When the comment was last edited';
COMMENT ON FUNCTION app.update_case_on_comment IS 'Updates case timestamp when comment is added';
COMMENT ON FUNCTION app.mark_sla_response_on_comment IS 'Marks SLA response met on first response';
COMMENT ON FUNCTION app.extract_comment_mentions IS 'Extracts @mentions from content';
COMMENT ON FUNCTION app.add_case_comment IS 'Adds a comment to a case';
COMMENT ON FUNCTION app.add_status_change_comment IS 'Adds a status change comment';
COMMENT ON FUNCTION app.get_case_comments IS 'Returns comments for a case';
COMMENT ON FUNCTION app.get_comment_replies IS 'Returns replies to a comment';
COMMENT ON FUNCTION app.edit_case_comment IS 'Edits a comment';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.edit_case_comment(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app.get_comment_replies(uuid, boolean);
-- DROP FUNCTION IF EXISTS app.get_case_comments(uuid, boolean, integer, integer);
-- DROP FUNCTION IF EXISTS app.add_status_change_comment(uuid, uuid, uuid, app.case_status, app.case_status, text);
-- DROP FUNCTION IF EXISTS app.add_case_comment(uuid, uuid, uuid, text, boolean, uuid, jsonb);
-- DROP TRIGGER IF EXISTS extract_comment_mentions ON app.case_comments;
-- DROP FUNCTION IF EXISTS app.extract_comment_mentions();
-- DROP TRIGGER IF EXISTS mark_sla_response_on_comment ON app.case_comments;
-- DROP FUNCTION IF EXISTS app.mark_sla_response_on_comment();
-- DROP TRIGGER IF EXISTS update_case_on_comment ON app.case_comments;
-- DROP FUNCTION IF EXISTS app.update_case_on_comment();
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.case_comments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.case_comments;
-- DROP INDEX IF EXISTS app.idx_case_comments_rich_content;
-- DROP INDEX IF EXISTS app.idx_case_comments_mentioned;
-- DROP INDEX IF EXISTS app.idx_case_comments_tenant;
-- DROP INDEX IF EXISTS app.idx_case_comments_case_type;
-- DROP INDEX IF EXISTS app.idx_case_comments_author;
-- DROP INDEX IF EXISTS app.idx_case_comments_parent;
-- DROP INDEX IF EXISTS app.idx_case_comments_case_public;
-- DROP INDEX IF EXISTS app.idx_case_comments_case_created;
-- DROP TABLE IF EXISTS app.case_comments;
