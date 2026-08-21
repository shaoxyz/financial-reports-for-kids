import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const brands = JSON.parse(readFileSync(join(root, "src/brands.json"), "utf8"));
const dataFile = join(root, "src/market-data.json");
const marketData = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : {};
const headers = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const number = (value) => Number(String(value ?? "").replace(/[$,%]/g, "").replaceAll(",", ""));
const isoDate = (value) => {
  const [month, day, year] = String(value).split("/");
  return year && month && day ? `${year}-${month}-${day}` : "";
};
const dateOneYearAgo = () => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
};

const request = async (symbol, endpoint) => {
  const url = new URL(`https://api.nasdaq.com/api/quote/${symbol}/${endpoint}`);
  url.searchParams.set("assetclass", "stocks");
  if (endpoint === "historical") {
    url.searchParams.set("fromdate", dateOneYearAgo());
    url.searchParams.set("limit", "5000");
  }
  const response = await fetch(url, { headers });
  const json = await response.json();
  if (!response.ok || json?.status?.rCode !== 200 || !json.data) {
    throw new Error(`${endpoint} unavailable`);
  }
  return json.data;
};

const targets = Object.entries(brands).filter(([slug]) => !marketData[slug]);
const failed = [];

for (const [slug, brand] of targets) {
  const symbol = brand.dataSymbol || brand.marketSymbol?.split(":").at(-1);
  try {
    const info = await request(symbol, "info");
    await wait(150);
    const summary = await request(symbol, "summary");
    await wait(150);
    const history = await request(symbol, "historical");
    await wait(150);
    const eps = await request(symbol, "eps");
    const rows = history.tradesTable?.rows || [];
    const closes = rows.map((row) => number(row.close)).filter(Number.isFinite);
    const latest = closes[0];
    const previous = closes[1];
    const actualEps = (eps.earningsPerShare || [])
      .filter((item) => item.type === "PreviousQuarter")
      .slice(-4)
      .map((item) => Number(item.earnings))
      .filter(Number.isFinite);
    const ttmEps = actualEps.reduce((sum, value) => sum + value, 0);
    const range = String(summary.summaryData?.FiftTwoWeekHighLow?.value || "")
      .replaceAll("$", "").split("/").map(number);
    if (!Number.isFinite(latest) || closes.length < 200) throw new Error("insufficient price history");

    marketData[slug] = {
      provider: "Nasdaq",
      providerUrl: `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}`,
      symbol,
      name: info.companyName || brand.query,
      currency: "USD",
      price: latest.toFixed(4),
      changePercent: Number.isFinite(previous) ? (((latest - previous) / previous) * 100).toFixed(4) : "",
      latestTradingDay: isoDate(rows[0]?.date),
      marketCapitalization: String(number(summary.summaryData?.MarketCap?.value || "")),
      peRatio: ttmEps > 0 ? (latest / ttmEps).toFixed(2) : "",
      week52High: Number.isFinite(range[0]) ? String(range[0]) : "",
      week52Low: Number.isFinite(range[1]) ? String(range[1]) : "",
      movingAverage50: (closes.slice(0, 50).reduce((sum, value) => sum + value, 0) / 50).toFixed(2),
      movingAverage200: (closes.slice(0, 200).reduce((sum, value) => sum + value, 0) / 200).toFixed(2),
      fetchedAt: new Date().toISOString(),
      methodNote: "价格、52周区间及市值来自 Nasdaq；50日和200日均线按收盘价计算；PE按最近收盘价除以最近四季实际EPS计算。"
    };
    writeFileSync(dataFile, `${JSON.stringify(marketData, null, 2)}\n`);
    console.log(`Backfilled ${slug} (${symbol})`);
  } catch (error) {
    failed.push(`${slug} (${symbol}): ${error.message}`);
    console.warn(`Skipped ${slug} (${symbol}): ${error.message}`);
  }
  await wait(250);
}

console.log(`Backfill complete: ${targets.length - failed.length} added, ${failed.length} skipped`);
if (failed.length) console.log(failed.join("\n"));
