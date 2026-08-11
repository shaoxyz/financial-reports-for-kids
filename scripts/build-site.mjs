import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sourceDir = join(root, "outputs/financial-reports");
const publicDir = join(root, "public");
const reportDir = join(publicDir, "reports");
const template = readFileSync(join(root, "src/index.html"), "utf8");
const brands = JSON.parse(readFileSync(join(root, "src/brands.json"), "utf8"));

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

const readableText = (color) => {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return "#fffdf6";
  const [red, green, blue] = color.slice(1).match(/../g).map((part) => Number.parseInt(part, 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155 ? "#16213e" : "#fffdf6";
};

const addBrandHeader = (html, { asset, color, company, query }, date) => {
  const textColor = readableText(color);
  const brandStyle = `<style id="archive-brand-style">
    .archive-brandbar{display:flex;align-items:center;gap:14px;min-height:58px;padding:10px max(18px,calc((100% - 1100px)/2));color:${textColor}!important;background:${color};text-decoration:none!important;font-family:"Avenir Next","PingFang SC",sans-serif;position:relative;z-index:1000}
    .archive-brandbar img{width:42px;height:38px;object-fit:contain;padding:6px;background:#fffdf6;border-radius:4px}
    .archive-brandbar span{font-size:.76rem;font-weight:800;letter-spacing:.06em;opacity:.88}
    .archive-brandbar strong{margin-left:auto;font-size:.82rem;letter-spacing:.04em}
    @media(max-width:560px){.archive-brandbar{min-height:52px}.archive-brandbar strong{font-size:0}.archive-brandbar strong::after{content:"全部报告";font-size:.78rem}.archive-brandbar img{width:38px;height:34px}}
  </style>`;
  const brandBar = `<a class="archive-brandbar" href="/" aria-label="返回全部财报"><img src="/brands/${asset}" alt="${query} Logo"><span>${company} · ${date}</span><strong>给孩子也看得懂的财报 ↗</strong></a>`;
  return html
    .replace(/<\/head>/i, `${brandStyle}</head>`)
    .replace(/<body([^>]*)>/i, `<body$1>${brandBar}`);
};

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
  const brand = brands[slug] || { company: companyNames[slug] || slug, query: slug, color: "#16213e", asset: `${slug}.svg` };
  writeFileSync(join(reportDir, file), addBrandHeader(html, brand, date));
  return {
    date,
    slug,
    company: companyNames[slug] || slug.replace(/([a-z])([A-Z])/g, "$1 $2"),
    industry: industries[slug] || "商业与财报",
    title,
    headline,
    brandColor: brand.color,
    brandText: readableText(brand.color),
    logo: `brands/${brand.asset}`,
    logoSource: brand.logoSource,
    href: `reports/${file.replace(/\.html$/, "")}`
  };
});

const cards = reports.map((report, index) => `
  <article class="report${index === 0 ? " latest" : ""}" style="--brand:${report.brandColor};--brand-text:${report.brandText}" data-search="${clean(`${report.company} ${report.industry} ${report.title}`).toLowerCase()}">
    <a href="${report.href}" aria-label="阅读 ${report.company} 财报">
      <div class="report-top"><time datetime="${report.date}">${report.date.replaceAll("-", ".")}</time><span>${report.industry}</span></div>
      <div class="report-brand"><img src="${report.logo}" alt="${report.company} Logo" loading="lazy"></div>
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
cpSync(join(root, "src/brand-assets"), join(publicDir, "brands"), { recursive: true });

console.log(`Built ${reports.length} reports into public/`);
