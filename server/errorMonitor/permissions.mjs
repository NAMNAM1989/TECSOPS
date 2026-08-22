/**
 * Mô hình quyền ERROR_MONITOR_AGENT.
 * Monitor không được sửa source, deploy prod, migrate, xóa DB, đổi secret.
 */

import { DENIED_ACTIONS, PERMISSIONS } from "./constants.mjs";

const ALLOWED = new Set([
  PERMISSIONS.READ_LOGS,
  PERMISSIONS.READ_HEALTH,
  PERMISSIONS.READ_DEPLOY_METADATA,
  PERMISSIONS.CREATE_EVENT,
  PERMISSIONS.CREATE_INCIDENT,
  PERMISSIONS.CREATE_BUG_REPORT,
  PERMISSIONS.CREATE_NOTIFICATION,
  PERMISSIONS.EXECUTE_HEALTH_CHECK,
  PERMISSIONS.EXECUTE_SAFE_DIAGNOSTIC,
  PERMISSIONS.EXECUTE_SCREENSHOT_TRACE,
]);

const DENIED = new Set(DENIED_ACTIONS);

const DENY_ALIASES = Object.freeze({
  edit_source: PERMISSIONS.DENY_SOURCE_EDIT,
  source_edit: PERMISSIONS.DENY_SOURCE_EDIT,
  write_application_source: PERMISSIONS.DENY_SOURCE_EDIT,
  deploy: PERMISSIONS.DENY_PROD_DEPLOY,
  prod_deploy: PERMISSIONS.DENY_PROD_DEPLOY,
  migrate: PERMISSIONS.DENY_MIGRATION,
  migration: PERMISSIONS.DENY_MIGRATION,
  drop_table: PERMISSIONS.DENY_DESTRUCTIVE_DB,
  destructive_db: PERMISSIONS.DENY_DESTRUCTIVE_DB,
  change_secret: PERMISSIONS.DENY_SECRET_CHANGE,
  secret_change: PERMISSIONS.DENY_SECRET_CHANGE,
});

export function assertAllowed(action) {
  const key = String(action || "").trim();
  const deny = DENY_ALIASES[key] || (DENIED.has(key) ? key : null);
  if (deny) {
    const err = new Error(`ERROR_MONITOR_AGENT bị từ chối: ${deny}`);
    err.code = "PERMISSION_DENIED";
    err.action = deny;
    throw err;
  }
  if (!ALLOWED.has(key)) {
    const err = new Error(`ERROR_MONITOR_AGENT không có quyền: ${key}`);
    err.code = "PERMISSION_DENIED";
    err.action = key;
    throw err;
  }
  return true;
}

export function can(action) {
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
    allow: [...ALLOWED],
    deny: [...DENIED],
    notes: [
      "READ: logs, health, deploy metadata",
      "CREATE: events, incidents, bug reports, notifications",
      "LIMITED execute: health check, safe diagnostic, screenshot/trace",
      "DENY: sửa source, deploy prod, migration, destructive DB, đổi secret",
    ],
  };
}
