import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const p = resolve(process.cwd(), ".env");
if (!existsSync(p)) {
  console.error("No .env found");
  process.exit(1);
}

let t = readFileSync(p, "utf8");

function get(key: string) {
  const m = t.match(new RegExp(`^${key}=\"?([^\"]*)\"?`, "m"));
  return m?.[1];
}

function set(key: string, value: string) {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}="${value}"`;
  t = re.test(t) ? t.replace(re, line) : `${t.trimEnd()}\n${line}\n`;
}

function weak(v: string | undefined, min = 24) {
  return !v || v.length < min || /change-me|local-dev|ChangeMe|local-cron/i.test(v);
}

if (weak(get("AUTH_SECRET"))) set("AUTH_SECRET", randomBytes(32).toString("hex"));
if (weak(get("CREDENTIALS_ENCRYPTION_KEY"))) set("CREDENTIALS_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
if (weak(get("CRON_SECRET"), 16)) set("CRON_SECRET", randomBytes(24).toString("hex"));

writeFileSync(p, t, "utf8");
console.log("Secrets refreshed.");
console.log("DATABASE_URL still:", get("DATABASE_URL"));
console.log("AUTH_SECRET length:", get("AUTH_SECRET")?.length);
console.log("CRON_SECRET length:", get("CRON_SECRET")?.length);
