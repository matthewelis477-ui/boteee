/**
 * One-shot Postgres setup for Botee.
 * Usage:
 *   set DATABASE_URL=postgresql://botee:botee@localhost:5432/botee?schema=public
 *   npx tsx scripts/setup-postgres.ts
 *
 * Or pass --url "postgresql://..."
 *
 * Prerequisites: Postgres running; schema.prisma provider = postgresql
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = process.cwd();

function loadEnv() {
  const p = resolve(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

function setEnvKey(key: string, value: string) {
  const p = resolve(ROOT, ".env");
  let text = existsSync(p) ? readFileSync(p, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}="${value}"`;
  if (re.test(text)) text = text.replace(re, line);
  else text = `${text.trimEnd()}\n${line}\n`;
  writeFileSync(p, text, "utf8");
  process.env[key] = value;
}

function ensureStrongSecrets() {
  const weak = (v: string | undefined, min = 24) => !v || v.length < min || /change-me|local-dev|ChangeMe/i.test(v);
  if (weak(process.env.AUTH_SECRET)) {
    const s = randomBytes(32).toString("hex");
    setEnvKey("AUTH_SECRET", s);
    console.log("Generated AUTH_SECRET");
  }
  if (weak(process.env.CREDENTIALS_ENCRYPTION_KEY)) {
    const s = randomBytes(32).toString("hex");
    setEnvKey("CREDENTIALS_ENCRYPTION_KEY", s);
    console.log("Generated CREDENTIALS_ENCRYPTION_KEY");
  }
  if (weak(process.env.CRON_SECRET, 16)) {
    const s = randomBytes(24).toString("hex");
    setEnvKey("CRON_SECRET", s);
    console.log("Generated CRON_SECRET");
  }
}

function ensurePostgresProvider() {
  const schemaPath = resolve(ROOT, "prisma/schema.prisma");
  let schema = readFileSync(schemaPath, "utf8");
  if (/provider\s*=\s*"sqlite"/.test(schema)) {
    schema = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
    writeFileSync(schemaPath, schema, "utf8");
    console.log("Switched prisma provider → postgresql");
  }
}

async function main() {
  loadEnv();
  const argUrl = process.argv.find((a) => a.startsWith("--url="))?.slice(6) || process.argv[process.argv.indexOf("--url") + 1];
  const url =
    (argUrl && !argUrl.startsWith("--") ? argUrl : "") ||
    process.env.DATABASE_URL ||
    "";

  if (!url || url.startsWith("file:")) {
    console.error(`
Missing Postgres DATABASE_URL.

Provide one of:
  1) Local:  postgresql://USER:PASSWORD@localhost:5432/botee?schema=public
  2) Neon/Supabase/etc hosted URL

Then run:
  npx tsx scripts/setup-postgres.ts --url "postgresql://..."

Or set DATABASE_URL in .env and re-run.
`);
    process.exit(1);
  }

  setEnvKey("DATABASE_URL", url);
  ensurePostgresProvider();
  ensureStrongSecrets();

  console.log("prisma generate…");
  execSync("npx prisma generate", { stdio: "inherit", cwd: ROOT, env: process.env });
  console.log("prisma db push…");
  execSync("npx prisma db push", { stdio: "inherit", cwd: ROOT, env: process.env });
  console.log("prisma db seed…");
  execSync("npx prisma db seed", { stdio: "inherit", cwd: ROOT, env: process.env });
  console.log("\nPostgres ready. Restart npm run dev, then open Admin → Launch config.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
