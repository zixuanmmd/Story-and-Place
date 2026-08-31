import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function validateDisasterRecoveryPlan(root = projectRoot) {
  const errors = [];
  const migrationDirectory = resolve(root, "supabase/migrations");
  const migrationNames = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const rebuildScript = readFileSync(
    resolve(root, "scripts/generate-supabase-rebuild.mjs"),
    "utf8",
  );
  for (const migrationName of migrationNames) {
    if (!rebuildScript.includes(`\"${migrationName}\"`)) {
      errors.push(`rebuild generator is missing ${migrationName}`);
    }
  }

  const document = readFileSync(resolve(root, "docs/disaster-recovery.md"), "utf8");
  for (const heading of [
    "## 恢复目标",
    "## 备份范围",
    "## 恢复职责",
    "## 恢复流程",
    "## 验证矩阵",
    "## 定期演练",
  ]) {
    if (!document.includes(heading)) errors.push(`DR document is missing ${heading}`);
  }

  const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
  for (const variable of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "RATE_LIMIT_SECRET",
    "MEDIA_CLEANUP_SECRET",
    "CRON_SECRET",
  ]) {
    const match = envExample.match(new RegExp(`^${variable}=(.*)$`, "m"));
    if (!match) errors.push(`.env.example is missing ${variable}`);
    else if (match[1]?.trim()) errors.push(`.env.example contains a value for ${variable}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    migrationCount: migrationNames.length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDisasterRecoveryPlan();
  if (!result.ok) {
    for (const error of result.errors) console.error(`FAIL: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`DR dry-run validation passed (${result.migrationCount} migrations).`);
    console.log("No database connection or remote mutation was performed.");
  }
}
