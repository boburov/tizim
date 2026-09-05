-- ═══════════════════════════════════════════════════════════════════
-- OWNER-ONLY PERMISSION DRIFT CHECK  —  100% READ-ONLY
-- Run per tenant database:  psql "$TENANT_DATABASE_URL" -f role-drift-check.sql
-- Safe on production. Contains no INSERT/UPDATE/DELETE/DDL.
-- ═══════════════════════════════════════════════════════════════════

\echo '=== 1. Non-owner roles holding OWNER-ONLY permissions (drift) ==='
SELECT r.value AS role_value, r."roleType", r."isSystem", p.key AS leaked_permission
FROM "_RolePermissions" rp
JOIN roles       r ON r.id = rp."B"
JOIN permissions p ON p.id = rp."A"
WHERE p.key IN (
  -- OWNER_ONLY_PERMISSIONS (common/constants/permission-scope.ts)
  'system.admin_access','branches.view_all','branches.create','branches.update','branches.delete',
  'approvals.decide_config','finance.approve','roles.create','roles.delete','courses.manage',
  'archive_reasons.manage','feedback_types.manage','notification_templates.manage',
  'holidays.manage','storage.manage','ai.config',
  -- COIN_OWNER_ONLY_PERMISSIONS (common/constants/coin.ts)
  'coin.settings'
)
AND r."roleType" <> 'owner'
ORDER BY r.value, p.key;

\echo ''
\echo '=== 2. Role inventory (permission counts) ==='
SELECT value, "roleType", "isSystem", "isFrozen",
       (SELECT count(*) FROM "_RolePermissions" x WHERE x."B" = roles.id) AS perm_count
FROM roles ORDER BY "roleType", value;

\echo ''
\echo '=== 3. Users holding a drifted role, with their branch assignments ==='
SELECT u.id, u.phone, u.role AS global_role, u."homeBranchId",
       COALESCE(string_agg(DISTINCT (uba."branchId" || COALESCE(':' || uba.role, '')), ', '), '(none)') AS branch_assignments
FROM users u
LEFT JOIN user_branch_assignments uba ON uba."userId" = u.id
WHERE u.role IN (
  SELECT DISTINCT r.value FROM "_RolePermissions" rp
  JOIN roles r ON r.id = rp."B" JOIN permissions p ON p.id = rp."A"
  WHERE r."roleType" <> 'owner'
    AND p.key IN ('system.admin_access','branches.view_all','coin.settings',
                  'branches.create','branches.update','branches.delete',
                  'approvals.decide_config','finance.approve','roles.create','roles.delete')
)
GROUP BY u.id, u.phone, u.role, u."homeBranchId"
ORDER BY u.role, u.id;

\echo ''
\echo '=== 4. Branch inventory (is this tenant actually multi-branch?) ==='
SELECT id, name, "isDeleted", "createdAt" FROM branches ORDER BY "createdAt";

\echo ''
\echo '=== 5. Users with NO branch binding at all (scope-ambiguous accounts) ==='
SELECT u.id, u.phone, u.role
FROM users u
LEFT JOIN user_branch_assignments uba ON uba."userId" = u.id
WHERE u."homeBranchId" IS NULL AND uba."userId" IS NULL AND u."isDeleted" = false
ORDER BY u.role;
