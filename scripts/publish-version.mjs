import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { hash, loadManifest, readJson, root, writeJson } from "./publish-state.mjs";
import { verifyPublication } from "./verify-publication.mjs";

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
export function assertCurrentMain(directory = root) {
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("fetch", "origin", "main");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    throw new Error("main advanced; retry from current main instead of deploying an older report");
  }
  git("diff", "--exit-code", "HEAD", "--");
}

export function stampPublication(directory = root, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Publication requires a full Git commit SHA");
  const { id, manifest, reportFile, stateFile } = loadManifest(directory);
  const state = readJson(stateFile);
  if (!["captured", "unavailable"].includes(state.status)) throw new Error("Market receipt is not finalized");
  if (state.status === "captured") {
    const snapshot = readJson(join(directory, "src/market-data.json"))[manifest.slug];
    if (hash(JSON.stringify(snapshot)) !== state.snapshotSha256) throw new Error("Market snapshot differs from persistent receipt");
  }
  const marker = {
    schemaVersion: 1, commit: sha, reportId: id,
    reportPath: `/reports/${id}`, sourceReportSha256: hash(readFileSync(reportFile)),
    marketStatus: state.status, snapshotFetchedAt: state.snapshotFetchedAt || null
  };
  writeJson(join(directory, "public/deployment.json"), marker);
  const htmlFiles = [join(directory, "public/index.html"),
    ...readdirSync(join(directory, "public/reports")).filter((name) => name.endsWith(".html"))
      .map((name) => join(directory, "public/reports", name))];
  for (const file of htmlFiles) {
    let html = readFileSync(file, "utf8").replace(/<meta name="deployment-sha" content="[a-f0-9]{40}">\n?/g, "");
    html = html.replace("</head>", `<meta name="deployment-sha" content="${sha}">\n</head>`);
    writeFileSync(file, html);
  }
  return marker;
}

export function uploadedVersion(output) {
  const records = output.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const uploads = records.filter((record) => record.type === "version-upload");
  if (uploads.length !== 1 || uploads[0].worker_name !== "financial-reports-for-kids" ||
      !/^[a-f0-9-]{36}$/.test(uploads[0].version_id || "")) {
    throw new Error("Wrangler did not return exactly one version for the expected Worker");
  }
  return uploads[0].version_id;
}

export async function deployPublication() {
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("Missing CLOUDFLARE_API_TOKEN");
  const sha = git("rev-parse", "HEAD");
  if (process.env.PUBLISH_SHA !== sha) throw new Error("Build SHA does not match HEAD");
  const config = readJson(join(root, "wrangler.ci.jsonc"));
  // Route-free config and version commands only: never fall back to ordinary deploy.
  if (config.name !== "financial-reports-for-kids" ||
      config.account_id !== "8eebcbe6c5b866b8c91ad391013d95a0" ||
      config.routes || config.route || config.triggers || config.main) {
    throw new Error("CI configuration must target the existing assets-only Worker without routes/triggers");
  }
  const marker = readJson(join(root, "public/deployment.json"));
  if (marker.commit !== sha) throw new Error("Assets were not stamped with the build SHA");
  assertCurrentMain();
  const output = join(root, ".wrangler/version-upload.ndjson");
  mkdirSync(join(root, ".wrangler"), { recursive: true });
  rmSync(output, { force: true });
  const cli = join(root, "node_modules/wrangler/bin/wrangler.js");
  const env = { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false",
    CLOUDFLARE_ACCOUNT_ID: config.account_id, WRANGLER_OUTPUT_FILE_PATH: output };
  const run = (...args) => execFileSync(process.execPath, [cli, ...args, "--config", "wrangler.ci.jsonc"],
    { cwd: root, env, stdio: "inherit", timeout: 240000 });
  run("versions", "upload", "--tag", sha, "--message", `Git commit ${sha}`);
  const versionId = uploadedVersion(readFileSync(output, "utf8"));
  // A concurrent cloud content commit may arrive while assets upload. Do not promote stale assets.
  assertCurrentMain();
  run("versions", "deploy", `${versionId}@100%`, "--yes", "--message", `Git commit ${sha}`);
  await verifyPublication(marker, versionId, { accountId: config.account_id });
  writeJson(join(root, ".wrangler/publication.json"), { ...marker, versionId });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `Published ${marker.reportId}\n\nCommit: ${sha}\n\nWorker version: ${versionId}\n\nMarket: ${marker.marketStatus}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "stamp") stampPublication(root, git("rev-parse", "HEAD"));
  else if (process.argv[2] === "deploy") await deployPublication();
  else throw new Error("Use publish-version.mjs stamp|deploy");
}
