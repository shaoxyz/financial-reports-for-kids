import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import * as simpleIcons from "simple-icons";

const root = new URL("../", import.meta.url).pathname;
const sourceDir = join(root, "outputs/financial-reports");
const publicDir = join(root, "public");
const reportDir = join(publicDir, "reports");
const assetsDir = join(root, "src/brand-assets");
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
  DeutscheTelekom: "德国电信",
  Microsoft: "微软",
  ProcterAndGamble: "宝洁",
  McDonalds: "麦当劳",
  Nike: "耐克"
};

const industries = {
  NVIDIA: "半导体与算力", PepsiCo: "食品饮料", JPMorganChase: "银行",
  Honeywell: "工业科技", JohnsonAndJohnson: "医疗健康", DeltaAirLines: "航空",
  Meta: "互联网广告", Starbucks: "连锁餐饮", Apple: "消费电子",
  Shell: "能源", Amazon: "电商与云计算", Tesla: "新能源汽车",
  Visa: "支付网络", Disney: "娱乐传媒", EliLilly: "制药",
  Airbnb: "旅行平台", Nintendo: "电子游戏", Uber: "出行平台",
  DeutscheTelekom: "通信运营", Microsoft: "软件与云计算",
  ProcterAndGamble: "日用消费品", McDonalds: "连锁餐饮",
  Nike: "运动鞋服"
};

const clean = (value) => value
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, " ")
  .trim();

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;");

const readableText = (color) => {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return "#fffdf6";
  const [red, green, blue] = color.slice(1).match(/../g).map((part) => Number.parseInt(part, 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155 ? "#16213e" : "#fffdf6";
};

const exportName = (slug) => `si${slug[0].toUpperCase()}${slug.slice(1)}`;

const overridePath = (name) => {
  if (!name || name !== basename(name) || !name.toLowerCase().endsWith(".svg")) return "";
  const resolved = resolve(assetsDir, name);
  const rel = relative(resolve(assetsDir), resolved);
  if (!rel || rel.startsWith("..")) return "";
  return existsSync(resolved) ? resolved : "";
};

const rewriteSvgRoot = (svg, label) => svg.replace(/<svg\b([^>]*)>/i, (_, attrs) => {
  const take = (attr) => {
    const match = attrs.match(new RegExp("\\b" + attr + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i"));
    return match ? (match[2] ?? match[3] ?? "") : "";
  };
  const classes = new Set(take("class").split(/\s+/).filter(Boolean));
  classes.add("brand-logo");
  const rest = attrs
    .replace(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/ig, "")
    .replace(/\srole\s*=\s*("([^"]*)"|'([^']*)')/ig, "")
    .replace(/\saria-label\s*=\s*("([^"]*)"|'([^']*)')/ig, "")
    .trim();
  const aria = take("aria-label") || label;
  return "<svg class=\"" + [...classes].join(" ") + "\" role=\"img\" aria-label=\"" + aria + "\"" + (rest ? " " + rest : "") + ">";
});

const inlineLogo = (slug, brand) => {
  const label = escapeXml(brand.query || brand.company || slug);
  const color = /^#[0-9a-f]{6}$/i.test(brand.color) ? brand.color : "#16213e";
  const file = overridePath(brand.override);
  if (file) {
    const svg = readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/^\s*<\?xml[^>]*>/, "").trim();
    return rewriteSvgRoot(svg, label);
  }
  const icon = (brand.simpleIcon && simpleIcons[brand.simpleIcon])
    || simpleIcons[exportName(slug.toLowerCase())];
  if (icon?.path) {
    return `<svg class="brand-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${label}"><path fill="${color}" d="${icon.path}"/></svg>`;
  }
  return `<svg class="brand-logo brand-logo-wordmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 180" role="img" aria-label="${label}"><text x="20" y="120" fill="${color}" font-family="Arial, sans-serif" font-size="76" font-weight="700">${label}</text></svg>`;
};

const addBrandHeader = (html, brand, date, logo) => {
  const textColor = readableText(brand.color);
  const brandStyle = `<style id="archive-brand-style">
    .archive-brandbar{display:flex;align-items:center;gap:14px;min-height:58px;padding:10px max(18px,calc((100% - 1100px)/2));color:${textColor}!important;background:${brand.color};text-decoration:none!important;font-family:"Avenir Next","PingFang SC",sans-serif;position:relative;z-index:1000}
    .archive-brandbar .brand-logo{width:42px;height:38px;object-fit:contain;padding:6px;background:#fffdf6;border-radius:4px;flex:0 0 auto}
    .archive-brandbar span{font-size:.76rem;font-weight:800;letter-spacing:.06em;opacity:.88}
    .archive-brandbar strong{margin-left:auto;font-size:.82rem;letter-spacing:.04em}
    @media(max-width:560px){.archive-brandbar{min-height:52px}.archive-brandbar strong{font-size:0}.archive-brandbar strong::after{content:"全部报告";font-size:.78rem}.archive-brandbar .brand-logo{width:38px;height:34px}}
  </style>`;
  const brandBar = `<a class="archive-brandbar" href="/" aria-label="返回全部财报">${logo}<span>${brand.company} · ${date}</span><strong>给孩子也看得懂的财报 ↗</strong></a>`;
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
  const brand = {
    company: companyNames[slug] || slug.replace(/([a-z])([A-Z])/g, "$1 $2"),
    query: slug,
    color: "#16213e",
    ...(brands[slug] || {})
  };
  brand.company = companyNames[slug] || brand.company;
  const logo = inlineLogo(slug, brand);
  writeFileSync(join(reportDir, file), addBrandHeader(html, brand, date, logo));
  return {
    date,
    slug,
    company: brand.company,
    industry: industries[slug] || "商业与财报",
    title,
    headline,
    brandColor: brand.color,
    brandText: readableText(brand.color),
    logo,
    href: `reports/${file.replace(/\.html$/, "")}`
  };
});

const cards = reports.map((report, index) => `
  <article class="report${index === 0 ? " latest" : ""}" style="--brand:${report.brandColor};--brand-text:${report.brandText}" data-search="${clean(`${report.company} ${report.industry} ${report.title}`).toLowerCase()}">
    <a href="${report.href}" aria-label="阅读 ${report.company} 财报">
      <div class="report-top"><time datetime="${report.date}">${report.date.replaceAll("-", ".")}</time><span>${report.industry}</span></div>
      <div class="report-brand">${report.logo}</div>
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
writeFileSync(join(publicDir, "reports.json"), JSON.stringify(reports.map(({ logo, ...rest }) => rest), null, 2));

const notFound = join(root, "src/404.html");
if (existsSync(notFound)) writeFileSync(join(publicDir, "404.html"), readFileSync(notFound));

console.log(`Built ${reports.length} reports into public/`);
