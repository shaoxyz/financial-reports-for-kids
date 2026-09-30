import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { captureMarket, loadManifest, readJson, reserveMarket, root, writeJson } from "../scripts/publish-state.mjs";
import { assertCurrentMain, stampPublication, uploadedVersion } from "../scripts/publish-version.mjs";
import { verifyPublication } from "../scripts/verify-publication.mjs";

const sha = "a".repeat(40);
const versionId = "12345678-1234-1234-1234-123456789abc";
const snapshot = { price: "99.31", fetchedAt: "2026-09-30T02:07:58.836Z" };
const manifest = { schemaVersion: 1, date: "2026-09-30", slug: "Example", industry: "示例行业" };
function fixture(t, market = {}) {
  const directory = mkdtempSync(join(tmpdir(), "financial-publish-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeJson(join(directory, "publishing/manifest.json"), manifest);
  writeJson(join(directory, "src/brands.json"), { Example: { company: "Example", marketSymbol: "NASDAQ:EXAMPLE" } });
  writeJson(join(directory, "src/market-data.json"), market);
  mkdirSync(join(directory, "outputs/financial-reports"), { recursive: true });
  writeFileSync(join(directory, "outputs/financial-reports/2026-09-30-Example.html"),
    '<html><head><title>Example report</title></head><body><h1>Example</h1><p>Official facts</p></body></html>');
  return directory;
}

test("existing report-day snapshot is adopted without any request, including cross-day retries", (t) => {
  const directory = fixture(t, { Example: snapshot, Other: { price: "42" } });
  const before = readFileSync(join(directory, "src/market-data.json"));
  assert.equal(reserveMarket(directory).capture, false);
  assert.equal(reserveMarket(directory, "2026-10-02T02:00:00Z").capture, false);
  assert.equal(readJson(loadManifest(directory).stateFile).reason, "existing-snapshot");
  assert.deepEqual(readFileSync(join(directory, "src/market-data.json")), before);
});

test("one successful attempt persists snapshot and preserves all other companies", (t) => {
  const directory = fixture(t, { Other: { price: "42" } });
  assert.equal(reserveMarket(directory).capture, true);
  let calls = 0;
  captureMarket(directory, (slug) => {
    calls++;
    assert.equal(slug, "Example");
    writeJson(join(directory, "src/market-data.json"), { Other: { price: "42" }, Example: snapshot });
    return true;
  });
  assert.equal(reserveMarket(directory, "2026-10-02T02:00:00Z").capture, false);
  assert.throws(() => captureMarket(directory, () => calls++), /must be reserved/);
  assert.equal(calls, 1);
  assert.deepEqual(readJson(join(directory, "src/market-data.json")).Other, { price: "42" });
});

test("failed or killed attempt never calls market updater again", (t) => {
  for (const interrupted of [false, true]) {
    const directory = fixture(t, { Example: { ...snapshot, fetchedAt: "2026-09-29T02:00:00Z" } });
    assert.equal(reserveMarket(directory).capture, true);
    if (!interrupted) captureMarket(directory, () => false);
    assert.equal(reserveMarket(directory, "2026-10-02T02:00:00Z").capture, false);
    const state = readJson(loadManifest(directory).stateFile);
    assert.equal(state.status, "unavailable");
    assert.equal(state.reason, interrupted ? "interrupted-attempt" : "api-unavailable");
  }
});

test("actual updater issues only quote/overview once and cross-day publication retries issue none", (t) => {
  const directory = fixture(t, { Other: { price: "42" } });
  mkdirSync(join(directory, "scripts"));
  cpSync(join(root, "scripts/update-market-data.mjs"), join(directory, "scripts/update-market-data.mjs"));
  const mock = join(directory, "mock-fetch.mjs");
  const calls = join(directory, "calls.json");
  writeFileSync(mock, `import { writeFileSync } from 'node:fs';
    const calls = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      if (url.hostname !== 'www.alphavantage.co' || url.searchParams.get('symbol') !== 'EXAMPLE') throw new Error('unexpected target');
      calls.push(url.searchParams.get('function'));
      writeFileSync(${JSON.stringify(calls)}, JSON.stringify(calls));
      return {ok:true,json:async()=>calls.length === 1 ? {'Global Quote':{'05. price':'99.31','07. latest trading day':'2026-09-29'}} : {Name:'Example'}};
    };`);
  assert.equal(reserveMarket(directory).capture, true);
  captureMarket(directory, (slug) => {
    execFileSync(process.execPath, ["--import", mock, join(directory, "scripts/update-market-data.mjs"), "--slug", slug],
      { env: { ...process.env, ALPHA_VANTAGE_API_KEY: "synthetic-test-only" }, stdio: "pipe" });
    return true;
  });
  assert.deepEqual(readJson(calls), ["GLOBAL_QUOTE", "OVERVIEW"]);
  assert.equal(reserveMarket(directory, "2026-10-02T02:00:00Z").capture, false);
  assert.deepEqual(readJson(calls), ["GLOBAL_QUOTE", "OVERVIEW"]);
  assert.deepEqual(readJson(join(directory, "src/market-data.json")).Other, { price: "42" });
});

test("Singapore date boundary is used to adopt a preexisting snapshot", (t) => {
  const directory = fixture(t, { Example: { ...snapshot, fetchedAt: "2026-09-29T16:00:00Z" } });
  assert.equal(reserveMarket(directory).capture, false);
});

test("invalid manifest paths/dates/unknown keys and missing report are rejected", (t) => {
  const directory = fixture(t);
  for (const invalid of [
    { ...manifest, slug: "../Other" }, { ...manifest, date: "2026-02-30" },
    { ...manifest, command: "echo injected" }, { ...manifest, industry: "<script>" }
  ]) {
    writeJson(join(directory, "publishing/manifest.json"), invalid);
    assert.throws(() => loadManifest(directory), /Invalid/);
  }
  writeJson(join(directory, "publishing/manifest.json"), { ...manifest, slug: "Missing" });
  assert.throws(() => loadManifest(directory), /report missing/);
});

test("receipt identity is semantic; altered industry cannot silently replace a receipt", (t) => {
  const directory = fixture(t, { Example: snapshot });
  reserveMarket(directory);
  writeJson(join(directory, "publishing/manifest.json"),
    { industry: manifest.industry, slug: manifest.slug, date: manifest.date, schemaVersion: 1 });
  assert.equal(reserveMarket(directory).capture, false);
  writeJson(join(directory, "publishing/manifest.json"), { ...manifest, industry: "changed" });
  assert.throws(() => reserveMarket(directory), /differs/);
});

test("full build discloses unavailable market, retains industry and stamps exact SHA", (t) => {
  const directory = fixture(t);
  reserveMarket(directory);
  captureMarket(directory, () => false);
  mkdirSync(join(directory, "scripts"));
  cpSync(join(root, "scripts/build-site.mjs"), join(directory, "scripts/build-site.mjs"));
  cpSync(join(root, "src/index.html"), join(directory, "src/index.html"));
  symlinkSync(join(root, "node_modules"), join(directory, "node_modules"), "dir");
  execFileSync(process.execPath, [join(directory, "scripts/build-site.mjs")], { stdio: "pipe" });
  const marker = stampPublication(directory, sha);
  const report = readFileSync(join(directory, "public/reports/2026-09-30-Example.html"), "utf8");
  const home = readFileSync(join(directory, "public/index.html"), "utf8");
  assert.match(report, /data-market-status="unavailable"/);
  assert.ok(home.includes("示例行业"));
  assert.ok(report.includes(`<meta name="deployment-sha" content="${sha}">`));
  assert.deepEqual(readJson(join(directory, "public/deployment.json")), marker);
  stampPublication(directory, sha);
  assert.equal(readFileSync(join(directory, "public/index.html"), "utf8").match(/name="deployment-sha"/g).length, 1);
});

test("changed snapshot and unfinished receipt cannot be stamped as completed", (t) => {
  const directory = fixture(t, { Example: snapshot });
  reserveMarket(directory);
  writeJson(join(directory, "src/market-data.json"), { Example: { ...snapshot, price: "100" } });
  assert.throws(() => stampPublication(directory, sha), /snapshot differs/);
  const fresh = fixture(t);
  reserveMarket(fresh);
  assert.throws(() => stampPublication(fresh, sha), /not finalized/);
});

test("Wrangler structured upload output rejects wrong Worker and ambiguous uploads", () => {
  const record = { type: "version-upload", worker_name: "financial-reports-for-kids", version_id: versionId };
  assert.equal(uploadedVersion(JSON.stringify(record)), versionId);
  assert.throws(() => uploadedVersion(JSON.stringify({ ...record, worker_name: "Other" })), /expected Worker/);
  assert.throws(() => uploadedVersion(`${JSON.stringify(record)}\n${JSON.stringify(record)}`), /exactly one/);
});

test("live verification checks Worker version tag, 100% traffic, home/report and exact public marker", async () => {
  const marker = { commit: sha, reportId: "2026-09-30-Example", reportPath: "/reports/2026-09-30-Example", marketStatus: "unavailable" };
  const paths = [];
  const fetcher = async (url) => {
    paths.push(new URL(url).pathname);
    const path = new URL(url).pathname;
    const json = path.includes(`/versions/${versionId}`)
      ? { success: true, result: { id: versionId, annotations: { "workers/tag": sha } } }
      : path.endsWith("/deployments")
        ? { success: true, result: { deployments: [{ versions: [{ version_id: versionId, percentage: 100 }] }] } }
        : marker;
    return { ok: true, json: async () => json,
      text: async () => `<meta name="deployment-sha" content="${sha}"><a href="reports/${marker.reportId}"></a><aside data-market-status="unavailable"></aside>` };
  };
  await verifyPublication(marker, versionId, { fetcher, accountId: "test", token: "test", attempts: 1 });
  assert.equal(paths.length, 5);
  assert.ok(paths.every((path) => !path.includes("/zones") && !path.endsWith("/routes")));
  await assert.rejects(verifyPublication({ ...marker, commit: "b".repeat(40) }, versionId,
    { fetcher, accountId: "test", token: "test", attempts: 1 }), /expected Git commit/);
});

test("main advancement and dirty tracked files block promotion", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "financial-publish-git-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repo = join(directory, "repo");
  const remote = join(directory, "remote.git");
  mkdirSync(repo);
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "--bare", remote);
  git("init", "--initial-branch=main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  writeFileSync(join(repo, "source"), "one");
  git("add", "source"); git("commit", "-m", "one");
  git("remote", "add", "origin", remote); git("push", "origin", "main");
  assertCurrentMain(repo);
  writeFileSync(join(repo, "source"), "dirty");
  assert.throws(() => assertCurrentMain(repo));
  git("add", "source"); git("commit", "-m", "two");
  const newer = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  git("push", "origin", "main");
  git("checkout", "HEAD~1");
  assert.throws(() => assertCurrentMain(repo), /main advanced/);
  git("checkout", newer);
  assertCurrentMain(repo);
});
