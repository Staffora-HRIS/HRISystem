import postgres, { type TransactionSql } from "postgres";

export const SUPER_ADMIN_ROLE_ID = "a0000000-0000-0000-0000-000000000001";

export interface BootstrapRootOptions {
  email: string;
  password: string;
  name?: string;
  tenantId?: string;
  tenantSlug?: string;
  tenantName?: string;
}

export interface BootstrapRootResult {
  userId: string;
  tenantId: string;
  email: string;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

async function withSystemContext<T>(
  db: ReturnType<typeof postgres>,
  fn: (tx: TransactionSql) => Promise<T>
): Promise<T> {
  return (await db.begin(async (tx) => {
    // Set a valid nil UUID to prevent RLS policy cast errors on empty string
    await tx`SELECT set_config('app.current_tenant', '00000000-0000-0000-0000-000000000000', true)`;
    await tx`SELECT app.enable_system_context()`;
    try {
      return await fn(tx);
    } finally {
      await tx`SELECT app.disable_system_context()`;
    }
  })) as T;
}

async function resolveOrCreateTenantId(
  tx: TransactionSql,
  opts: Pick<BootstrapRootOptions, "tenantId" | "tenantSlug" | "tenantName">
): Promise<string> {
  if (opts.tenantId) {
    const existing = await tx<{ id: string }[]>`
      SELECT id FROM app.tenants WHERE id = ${opts.tenantId}::uuid
    `;
    if (existing.length > 0 && existing[0]) return existing[0].id;
  }

  const tenantSlug = normalizeSlug(opts.tenantSlug ?? "default");
  const tenantName = opts.tenantName ?? "Default Tenant";

  const bySlug = await tx<{ id: string }[]>`
    SELECT id FROM app.tenants WHERE slug = ${tenantSlug}
  `;
  if (bySlug.length > 0 && bySlug[0]) return bySlug[0].id;

  const created = await tx<{ id: string }[]>`
    INSERT INTO app.tenants (id, name, slug, status)
    VALUES (gen_random_uuid(), ${tenantName}, ${tenantSlug}, 'active')
    RETURNING id
  `;

  if (!created[0]) throw new Error("Failed to create tenant");
  return created[0].id;
}

export async function bootstrapRoot(
  db: ReturnType<typeof postgres>,
  options: BootstrapRootOptions
): Promise<BootstrapRootResult> {
  const email = normalizeEmail(options.email);
  const password = options.password;

  return await withSystemContext(db, async (tx) => {
    const tenantId = await resolveOrCreateTenantId(tx, options);

    if (!tenantId || !isUuid(tenantId)) {
      throw new Error(`Invalid tenantId resolved for bootstrapRoot: ${String(tenantId)}`);
    }

    // Ensure the system super_admin role exists (normally created by migrations).
    // This makes the bootstrap script robust in fresh/dev databases.
    await tx`
      INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
      VALUES (
        ${SUPER_ADMIN_ROLE_ID}::uuid,
        NULL,
        'super_admin',
        'Platform super administrator with unrestricted access to all features and tenants',
        true,
        '{"*:*": true}'::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `;

    const existing = await tx<{ id: string }[]>`
      SELECT id FROM app.users WHERE email = ${email}
    `;
    const userId = existing[0]?.id ?? crypto.randomUUID();

    if (!userId || !isUuid(userId)) {
      throw new Error(`Invalid userId resolved for bootstrapRoot: ${String(userId)}`);
    }

    const insertedUser = await tx<{ id: string }[]>`
      INSERT INTO app.users (id, email, password_hash, status, email_verified, name)
      VALUES (
        ${userId}::uuid,
        ${email},
        app.hash_password(${password}),
        'active',
        true,
        ${options.name ?? "Root"}
      )
      ON CONFLICT (email) DO UPDATE
      SET
        password_hash = EXCLUDED.password_hash,
        status = 'active',
        email_verified = true,
        name = COALESCE(EXCLUDED.name, app.users.name),
        updated_at = now()
      RETURNING id
    `;

    if (!insertedUser[0]?.id) throw new Error("Failed to create/update root user");

    // Ensure tenant/user context is set to valid UUID text.
    // Important: many RLS policies cast current_setting('app.current_tenant')::uuid.
    // If the setting is empty, Postgres errors even in system context.
    // Use session scope (is_local=false) so context remains valid for follow-up cleanup.
    await tx`SELECT set_config('app.current_tenant', ${tenantId}, false)`;
    await tx`SELECT set_config('app.current_user', ${userId}, false)`;

    await tx`
      INSERT INTO app.user_tenants (tenant_id, user_id, is_primary, status)
      VALUES (${tenantId}::uuid, ${userId}::uuid, false, 'active')
      ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET status = 'active', updated_at = now()
    `;

    // Set primary in a separate statement.
    // This avoids Postgres error 21000 when a BEFORE INSERT trigger modifies the
    // conflict row during an INSERT ... ON CONFLICT DO UPDATE.
    await tx`
      UPDATE app.user_tenants
      SET is_primary = true, status = 'active', updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid
        AND user_id = ${userId}::uuid
    `;

    // Some triggers temporarily toggle system context; ensure it's still enabled.
    await tx`SELECT app.enable_system_context()`;

    const existingRole = await tx<{ id: string }[]>`
      SELECT id
      FROM app.role_assignments
      WHERE tenant_id = ${tenantId}::uuid
        AND user_id = ${userId}::uuid
        AND role_id = ${SUPER_ADMIN_ROLE_ID}::uuid
        AND effective_to IS NULL
      ORDER BY assigned_at DESC, created_at DESC
      LIMIT 1
    `;

    if (existingRole.length === 0) {
      await tx`
        INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
        VALUES (${tenantId}::uuid, ${userId}::uuid, ${SUPER_ADMIN_ROLE_ID}::uuid, '{}'::jsonb)
      `;
    } else {
      // Best-effort cleanup in case duplicates already exist (no unique constraint).
      await tx`
        DELETE FROM app.role_assignments
        WHERE tenant_id = ${tenantId}::uuid
          AND user_id = ${userId}::uuid
          AND role_id = ${SUPER_ADMIN_ROLE_ID}::uuid
          AND effective_to IS NULL
          AND id != ${existingRole[0]!.id}::uuid
      `;
    }

    return { userId, tenantId, email };
  });
}
