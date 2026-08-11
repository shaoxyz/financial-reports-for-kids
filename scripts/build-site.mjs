import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sourceDir = join(root, "outputs/financial-reports");
const publicDir = join(root, "public");
const reportDir = join(publicDir, "reports");
const template = readFileSync(join(root, "src/index.html"), "utf8");

const companyNames = {
  NVIDIA: "英伟达",
  PepsiCo: "百事公司",
  JPMorganChase: "摩根大通",
  Honeywell: "霍尼韦尔",
  JohnsonAndJohnson: "强生",
  DeltaAirLines: "达美航空",
  Meta: "Meta",
  Starbucks: "星巴克",
  Apple: "苹果",
  Shell: "壳牌",
  Amazon: "亚马逊",
  Tesla: "特斯拉",
  Visa: "Visa",
  Disney: "迪士尼",
  EliLilly: "礼来",
  Airbnb: "Airbnb",
  Nintendo: "任天堂",
  Uber: "Uber",
  DeutscheTelekom: "德国电信"
};

const industries = {
  NVIDIA: "半导体与算力", PepsiCo: "食品饮料", JPMorganChase: "银行",
  Honeywell: "工业科技", JohnsonAndJohnson: "医疗健康", DeltaAirLines: "航空",
  Meta: "互联网广告", Starbucks: "连锁餐饮", Apple: "消费电子",
  Shell: "能源", Amazon: "电商与云计算", Tesla: "新能源汽车",
  Visa: "支付网络", Disney: "娱乐传媒", EliLilly: "制药",
  Airbnb: "旅行平台", Nintendo: "电子游戏", Uber: "出行平台",
  DeutscheTelekom: "通信运营"
};

const clean = (value) => value
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, " ")
  .trim();

const files = readdirSync(sourceDir)
  .filter((name) => /^\d{4}-\d{2}-\d{2}-.+\.html$/.test(name))
  .sort()
  .reverse();

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(reportDir, { recursive: true });

const reports = files.map((file) => {
  const html = readFileSync(join(sourceDir, file), "utf8");
  const [, date, slug] = file.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.html$/);
  const title = clean(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || slug);
  const headline = clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || title);
  copyFileSync(join(sourceDir, file), join(reportDir, file));
  return {
    date,
    slug,
    company: companyNames[slug] || slug.replace(/([a-z])([A-Z])/g, "$1 $2"),
    industry: industries[slug] || "商业与财报",
    title,
    headline,
    href: `reports/${file.replace(/\.html$/, "")}`
  };
});

const cards = reports.map((report, index) => `
  <article class="report${index === 0 ? " latest" : ""}" data-search="${clean(`${report.company} ${report.industry} ${report.title}`).toLowerCase()}">
    <a href="${report.href}" aria-label="阅读 ${report.company} 财报">
      <div class="report-top"><time datetime="${report.date}">${report.date.replaceAll("-", ".")}</time><span>${report.industry}</span></div>
      <h2>${report.company}</h2>
      <p>${report.headline}</p>
      <strong>打开报告 <i aria-hidden="true">↗</i></strong>
    </a>
  </article>`).join("");

const output = template
  .replaceAll("{{REPORT_COUNT}}", String(reports.length))
  .replaceAll("{{LATEST_DATE}}", reports[0]?.date || "")
  .replace("{{REPORT_CARDS}}", cards);

writeFileSync(join(publicDir, "index.html"), output);
writeFileSync(join(publicDir, "reports.json"), JSON.stringify(reports, null, 2));
cpSync(join(root, "src/404.html"), join(publicDir, "404.html"));

console.log(`Built ${reports.length} reports into public/`);
