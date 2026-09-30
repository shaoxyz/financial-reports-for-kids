import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
export const writeJson = (file, value) => {
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const singaporeDate = (value) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date(value));

export function loadManifest(directory = root) {
  const manifest = readJson(join(directory, "publishing/manifest.json"));
  const keys = Object.keys(manifest).sort().join(",");
  if (keys !== "date,industry,schemaVersion,slug" || manifest.schemaVersion !== 1 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(manifest.date) ||
      !Number.isFinite(Date.parse(`${manifest.date}T00:00:00Z`)) ||
      new Date(`${manifest.date}T00:00:00Z`).toISOString().slice(0, 10) !== manifest.date ||
      !/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(manifest.slug) ||
      typeof manifest.industry !== "string" || !manifest.industry.trim() ||
      manifest.industry.length > 80 || /[<>\r\n]/.test(manifest.industry)) {
    throw new Error("Invalid publishing/manifest.json contract");
  }
  const id = `${manifest.date}-${manifest.slug}`;
  const reportFile = join(directory, `outputs/financial-reports/${id}.html`);
  if (!existsSync(reportFile) || !readFileSync(reportFile, "utf8").includes("</head>")) {
    throw new Error(`Manifest report missing or invalid: ${id}`);
  }
  const brands = readJson(join(directory, "src/brands.json"));
  if (!brands[manifest.slug]) throw new Error("Manifest company missing from src/brands.json");
  return { manifest, id, reportFile, stateFile: join(directory, `publishing/market-attempts/${id}.json`) };
}

function snapshotFor(directory, slug) {
  const file = join(directory, "src/market-data.json");
  return existsSync(file) ? readJson(file)[slug] : undefined;
}

export function reserveMarket(directory = root, now = new Date().toISOString()) {
  const context = loadManifest(directory);
  const { manifest, stateFile } = context;
  if (existsSync(stateFile)) {
    const state = readJson(stateFile);
    if (!["schemaVersion", "date", "slug", "industry"].every((key) => state.manifest?.[key] === manifest[key]) ||
        !["reserved", "captured", "unavailable"].includes(state.status)) {
      throw new Error("Manifest differs from its persistent market receipt");
    }
    // A previous process may have died after the reservation was pushed. Never call again.
    if (state.status === "reserved") {
      state.status = "unavailable";
      state.reason = "interrupted-attempt";
      writeJson(stateFile, state);
    }
    return { ...context, capture: false };
  }
  const snapshot = snapshotFor(directory, manifest.slug);
  const adopt = snapshot?.price && snapshot?.fetchedAt &&
    Number.isFinite(Date.parse(snapshot.fetchedAt)) && singaporeDate(snapshot.fetchedAt) === manifest.date;
  const state = {
    schemaVersion: 1, manifest,
    status: adopt ? "captured" : "reserved",
    attemptedAt: now,
    reason: adopt ? "existing-snapshot" : "new-attempt"
  };
  if (adopt) {
    state.snapshotFetchedAt = snapshot.fetchedAt;
    state.snapshotSha256 = hash(JSON.stringify(snapshot));
  }
  writeJson(stateFile, state);
  return { ...context, capture: !adopt };
}

export function captureMarket(directory = root, run = (slug) => spawnSync("npm",
  ["run", "market:update", "--", "--slug", slug],
  { cwd: directory, stdio: "ignore", timeout: 90000 }).status === 0) {
  const { manifest, stateFile } = loadManifest(directory);
  const state = readJson(stateFile);
  if (state.status !== "reserved") throw new Error("Market attempt must be reserved and pushed first");
  const ok = run(manifest.slug);
  const snapshot = snapshotFor(directory, manifest.slug);
  state.status = ok && snapshot?.price && snapshot?.fetchedAt ? "captured" : "unavailable";
  state.reason = state.status === "captured" ? "api-snapshot" : "api-unavailable";
  if (state.status === "captured") {
    state.snapshotFetchedAt = snapshot.fetchedAt;
    state.snapshotSha256 = hash(JSON.stringify(snapshot));
  }
  writeJson(stateFile, state);
  console.log(`Market ${manifest.slug}: ${state.status}; persistent attempts will not be repeated`);
  return state;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === "reserve") {
    const result = reserveMarket();
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      `capture_market=${result.capture}\nreport_id=${result.id}\n`);
    console.log(`Reserved ${result.id}; capture_market=${result.capture}`);
  } else if (command === "capture") {
    captureMarket();
  } else throw new Error("Use publish-state.mjs reserve|capture");
}
