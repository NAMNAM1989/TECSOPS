export const ALLOWED_ACTIONS = [
  "READ_LOGS",
  "READ_HEALTH",
  "READ_DEPLOY_METADATA",
  "CREATE_EVENT",
  "CREATE_INCIDENT",
  "CREATE_BUG_REPORT",
  "CREATE_NOTIFICATION",
  "EXECUTE_HEALTH_CHECK",
  "EXECUTE_SAFE_DIAGNOSTIC",
  "EXECUTE_SCREENSHOT_TRACE",
] as const;

export const DENIED_ACTIONS = [
  "DENY_SOURCE_EDIT",
  "DENY_PROD_DEPLOY",
  "DENY_MIGRATION",
  "DENY_DESTRUCTIVE_DB",
  "DENY_SECRET_CHANGE",
] as const;

const DENY_ALIASES: Record<string, string> = {
  edit_source: "DENY_SOURCE_EDIT",
  source_edit: "DENY_SOURCE_EDIT",
  write_application_source: "DENY_SOURCE_EDIT",
  deploy: "DENY_PROD_DEPLOY",
  prod_deploy: "DENY_PROD_DEPLOY",
  migrate: "DENY_MIGRATION",
  migration: "DENY_MIGRATION",
  drop_table: "DENY_DESTRUCTIVE_DB",
  destructive_db: "DENY_DESTRUCTIVE_DB",
  change_secret: "DENY_SECRET_CHANGE",
  secret_change: "DENY_SECRET_CHANGE",
};

export function assertAllowed(action: string): true {
  const key = String(action || "").trim();
  const deny = DENY_ALIASES[key] || (DENIED_ACTIONS.includes(key as (typeof DENIED_ACTIONS)[number]) ? key : null);
  if (deny) {
    const err = new Error(`ERROR_MONITOR_AGENT bị từ chối: ${deny}`);
    (err as Error & { code: string; action: string }).code = "PERMISSION_DENIED";
    (err as Error & { action: string }).action = deny;
    throw err;
  }
  if (!(ALLOWED_ACTIONS as readonly string[]).includes(key)) {
    const err = new Error(`ERROR_MONITOR_AGENT không có quyền: ${key}`);
    (err as Error & { code: string }).code = "PERMISSION_DENIED";
    throw err;
  }
  return true;
}

export function can(action: string): boolean {
  try {
    assertAllowed(action);
    return true;
  } catch {
    return false;
  }
}

export function permissionModel() {
  return {
    agent: "ERROR_MONITOR_AGENT",
    allow: [...ALLOWED_ACTIONS],
    deny: [...DENIED_ACTIONS],
    notes: [
      "READ: logs, health, deploy metadata",
      "CREATE: events, incidents, bug reports, notifications",
      "LIMITED execute: health check, safe diagnostic, screenshot/trace",
      "DENY: sửa source, deploy prod, migration, destructive DB, đổi secret",
    ],
  };
}
