import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const brandsFile = join(root, "src/brands.json");
const dataFile = join(root, "src/market-data.json");
const envFile = join(root, ".env.market.local");

const envKey = () => {
  if (process.env.ALPHA_VANTAGE_API_KEY) return process.env.ALPHA_VANTAGE_API_KEY.trim();
  if (!existsSync(envFile)) return "";
  const line = readFileSync(envFile, "utf8").split(/\r?\n/)
    .find((entry) => entry.startsWith("ALPHA_VANTAGE_API_KEY="));
  return line ? line.slice(line.indexOf("=") + 1).trim() : "";
};

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};

const apiKey = envKey();
if (!apiKey) {
  throw new Error("缺少 Alpha Vantage API Key：请配置 ALPHA_VANTAGE_API_KEY 或 .env.market.local");
}

const brands = JSON.parse(readFileSync(brandsFile, "utf8"));
const slug = argument("--slug");
if (!slug || !brands[slug]) throw new Error("请使用 --slug 指定 src/brands.json 中已有的公司");
const brand = brands[slug];
const symbol = brand.dataSymbol || brand.marketSymbol?.split(":").at(-1);
if (!symbol) throw new Error(`${slug} 尚未配置行情代码`);

const current = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : {};
const force = process.argv.includes("--force");
const singaporeDay = (value) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Singapore",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date(value));

if (!force && current[slug]?.fetchedAt && singaporeDay(current[slug].fetchedAt) === singaporeDay(Date.now())) {
  console.log(`Skipped ${slug}: market snapshot already updated today`);
  process.exit(0);
}

const request = async (fn) => {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", fn);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Alpha Vantage ${fn} 请求失败：HTTP ${response.status}`);
  const json = await response.json();
  const error = json.Note || json.Information || json["Error Message"];
  if (error) throw new Error(`Alpha Vantage ${fn} 返回错误：${error}`);
  return json;
};

const quote = await request("GLOBAL_QUOTE");
await new Promise((resolve) => setTimeout(resolve, 1200));
const overview = await request("OVERVIEW");
const q = quote["Global Quote"] || {};
if (!q["05. price"]) throw new Error(`未取得 ${symbol} 的最近价格`);

current[slug] = {
  provider: "Alpha Vantage",
  symbol,
  name: overview.Name || brand.company,
  currency: overview.Currency || "USD",
  price: q["05. price"],
  changePercent: String(q["10. change percent"] || "").replace("%", ""),
  latestTradingDay: q["07. latest trading day"] || "",
  marketCapitalization: overview.MarketCapitalization || "",
  peRatio: overview.PERatio || "",
  week52High: overview["52WeekHigh"] || "",
  week52Low: overview["52WeekLow"] || "",
  movingAverage50: overview["50DayMovingAverage"] || "",
  movingAverage200: overview["200DayMovingAverage"] || "",
  fetchedAt: new Date().toISOString()
};

writeFileSync(dataFile, `${JSON.stringify(current, null, 2)}\n`);
console.log(`Updated ${slug} market snapshot (${symbol}, ${current[slug].latestTradingDay})`);
