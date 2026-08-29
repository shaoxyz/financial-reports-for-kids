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
const marketDataFile = join(root, "src/market-data.json");
const marketData = existsSync(marketDataFile) ? JSON.parse(readFileSync(marketDataFile, "utf8")) : {};

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
  Nike: "耐克",
  Toyota: "丰田",
  LVMH: "LVMH 路威酩轩",
  Tencent: "腾讯",
  HomeDepot: "家得宝",
  EsteeLauder: "雅诗兰黛集团",
  Walmart: "沃尔玛",
  BHP: "必和必拓",
  Alibaba: "阿里巴巴",
  Deere: "约翰迪尔",
  Target: "Target 塔吉特",
  Intuit: "Intuit",
  Salesforce: "Salesforce",
  HP: "HP",
  BestBuy: "百思买"
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
  Nike: "运动鞋服", Toyota: "汽车制造", LVMH: "奢侈品集团",
  Tencent: "互联网平台与游戏", HomeDepot: "家居建材零售",
  EsteeLauder: "高端美妆", Walmart: "综合零售", BHP: "矿业与资源",
  Alibaba: "电商平台与云计算", Deere: "农业与工程机械",
  Target: "综合零售", Intuit: "财税与中小企业软件",
  Salesforce: "企业软件与CRM", HP: "电脑与打印",
  BestBuy: "消费电子零售"
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
    .archive-brandbar .brand-logo-wordmark{width:82px;padding:5px 7px}
    .archive-brandbar span{font-size:.76rem;font-weight:800;letter-spacing:.06em;opacity:.88}
    .archive-brandbar strong{margin-left:auto;font-size:.82rem;letter-spacing:.04em}
    @media(max-width:560px){.archive-brandbar{min-height:52px}.archive-brandbar strong{font-size:0}.archive-brandbar strong::after{content:"全部报告";font-size:.78rem}.archive-brandbar .brand-logo{width:38px;height:34px}.archive-brandbar .brand-logo-wordmark{width:70px}}
  </style>`;
  const brandBar = `<a class="archive-brandbar" href="/" aria-label="返回全部财报">${logo}<span>${brand.company} · ${date}</span><strong>给孩子也看得懂的财报 ↗</strong></a>`;
  return html
    .replace(/<\/head>/i, `${brandStyle}</head>`)
    .replace(/<body([^>]*)>/i, `<body$1>${brandBar}`);
};

const marketNumber = (value, digits = 2) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN", { maximumFractionDigits: digits }) : "—";
};

const marketCapText = (value, currency) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (currency === "USD") {
    if (number >= 1e12) return `${marketNumber(number / 1e12)}万亿美元`;
    if (number >= 1e8) return `${marketNumber(number / 1e8)}亿美元`;
  }
  return `${marketNumber(number, 0)} ${currency}`;
};

const marketDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date).replaceAll("/", "-");
};

const addMarketSnapshot = (html, brand, snapshot) => {
  if (!snapshot?.price) return html;
  const currency = escapeXml(snapshot.currency || "USD");
  const price = Number(snapshot.price);
  const low = Number(snapshot.week52Low);
  const high = Number(snapshot.week52High);
  const moving50 = Number(snapshot.movingAverage50);
  const moving200 = Number(snapshot.movingAverage200);
  const rangePosition = Number.isFinite(price) && Number.isFinite(low) && Number.isFinite(high) && high > low
    ? Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100))
    : 50;
  const pe = Number(snapshot.peRatio);
  const sources = snapshot.sources || [{
    name: snapshot.provider || "行情数据源",
    url: snapshot.providerUrl || "https://www.alphavantage.co/documentation/"
  }];
  const sourceLinks = sources.map((source) =>
    `<a href="${escapeXml(source.url)}" rel="noopener nofollow" target="_blank">${escapeXml(source.name)}</a>`
  ).join("、");
  const change = Number.parseFloat(snapshot.changePercent);
  const changeText = Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${marketNumber(change)}%` : "—";
  const trend = snapshot.trendText || (Number.isFinite(price) && Number.isFinite(moving50) && Number.isFinite(moving200)
    ? price >= moving50 && moving50 >= moving200
      ? "价格在两条均线上方"
      : price < moving50 && moving50 < moving200
        ? "价格在两条均线下方"
        : "短期与长期趋势交错"
    : "趋势数据暂不完整");
  const trendDetail = snapshot.trendDetail || `50日 ${currency === "USD" ? "$" : ""}${marketNumber(moving50)} · 200日 ${currency === "USD" ? "$" : ""}${marketNumber(moving200)}`;
  const snapshotStyle = `<style id="market-snapshot-style">
    .market-snapshot{max-width:1100px;margin:clamp(28px,5vw,60px) auto;padding:clamp(22px,3.5vw,38px);border-top:4px solid ${brand.color};background:color-mix(in srgb,${brand.color} 5%,#fffdf6);color:#16213e;font-family:"Avenir Next","PingFang SC",sans-serif}
    .market-snapshot__head{display:grid;grid-template-columns:minmax(210px,.72fr) 1.28fr;gap:clamp(20px,5vw,64px);align-items:end;margin-bottom:24px}
    .market-snapshot__kicker{display:block;margin-bottom:8px;color:${brand.color};font-size:.72rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
    .market-snapshot h2{margin:0;color:#16213e;font-size:clamp(1.5rem,3vw,2.35rem);line-height:1.12}
    .market-snapshot__lesson{margin:0;color:#47526a;font-size:.92rem;line-height:1.75}
    .market-snapshot__metrics{display:grid;grid-template-columns:1.15fr 1fr .8fr 1.15fr;border-top:1px solid color-mix(in srgb,${brand.color} 25%,transparent);border-bottom:1px solid color-mix(in srgb,${brand.color} 25%,transparent)}
    .market-snapshot__metric{padding:18px 16px 17px 0}
    .market-snapshot__metric+.market-snapshot__metric{padding-left:18px;border-left:1px solid color-mix(in srgb,${brand.color} 18%,transparent)}
    .market-snapshot__metric span{display:block;margin-bottom:7px;color:#6a7285;font-size:.72rem;font-weight:800;letter-spacing:.06em}
    .market-snapshot__metric strong{display:block;color:#16213e;font-size:clamp(1.12rem,2vw,1.65rem);line-height:1.2}
    .market-snapshot__metric small{display:block;margin-top:6px;color:#687086;font-size:.72rem;line-height:1.4}
    .market-snapshot__range{margin-top:22px}
    .market-snapshot__range-labels{display:flex;justify-content:space-between;gap:16px;color:#687086;font-size:.72rem;font-weight:750}
    .market-snapshot__track{height:9px;margin:8px 0;background:color-mix(in srgb,${brand.color} 13%,#e6e8ee);position:relative}
    .market-snapshot__track::before{content:"";position:absolute;inset:0 auto 0 0;width:${rangePosition.toFixed(1)}%;background:${brand.color}}
    .market-snapshot__track::after{content:"";position:absolute;top:50%;left:${rangePosition.toFixed(1)}%;width:15px;height:15px;border:3px solid #fffdf6;background:${brand.color};border-radius:50%;transform:translate(-50%,-50%)}
    .market-snapshot__foot{margin:18px 0 0;color:#687086;font-size:.72rem;line-height:1.65}
    .market-snapshot__foot a{color:${brand.color};font-weight:800}
    @media(max-width:720px){.market-snapshot{margin:28px 14px;padding:21px 16px}.market-snapshot__head{grid-template-columns:1fr;gap:10px}.market-snapshot__metrics{grid-template-columns:1fr 1fr}.market-snapshot__metric:nth-child(3){padding-left:0;border-left:0;border-top:1px solid color-mix(in srgb,${brand.color} 18%,transparent)}.market-snapshot__metric:nth-child(4){border-top:1px solid color-mix(in srgb,${brand.color} 18%,transparent)}}
  </style>`;
  const card = `<aside class="market-snapshot" aria-labelledby="market-snapshot-title">
    <div class="market-snapshot__head"><div><span class="market-snapshot__kicker">行情快照 · ${escapeXml(snapshot.symbol)}</span><h2 id="market-snapshot-title">价格是标签，不是答案</h2></div><p class="market-snapshot__lesson"><strong>先知道市场给它标了多少钱，再回头看生意值不值。</strong>下面是最近交易日的静态快照，不会随着网页刷新跳动，也不构成买卖建议。</p></div>
    <div class="market-snapshot__metrics"><div class="market-snapshot__metric"><span>最近收盘价</span><strong>${currency === "USD" ? "$" : ""}${marketNumber(price)}</strong><small>${changeText} · ${escapeXml(snapshot.latestTradingDay || "日期未知")}</small></div><div class="market-snapshot__metric"><span>市值</span><strong>${marketCapText(snapshot.marketCapitalization, currency)}</strong><small>股价 × 流通在外股份的近似总价</small></div><div class="market-snapshot__metric"><span>市盈率 PE（TTM）</span><strong>${Number.isFinite(pe) && pe > 0 ? marketNumber(pe, 1) + " 倍" : "不适用"}</strong><small>股价相当于过去12个月每股利润的多少倍</small></div><div class="market-snapshot__metric"><span>${escapeXml(snapshot.trendLabel || "均线位置")}</span><strong>${escapeXml(trend)}</strong><small>${escapeXml(trendDetail)}</small></div></div>
    <div class="market-snapshot__range"><div class="market-snapshot__range-labels"><span>52周低点 ${currency === "USD" ? "$" : ""}${marketNumber(low)}</span><span>当前约在区间 ${marketNumber(rangePosition, 0)}% 位置</span><span>52周高点 ${currency === "USD" ? "$" : ""}${marketNumber(high)}</span></div><div class="market-snapshot__track" role="img" aria-label="当前价格位于52周最低与最高价格之间约${marketNumber(rangePosition, 0)}%的位置"></div></div>
    <p class="market-snapshot__foot">证券：${escapeXml(snapshot.name || brand.company)}（${escapeXml(snapshot.symbol)}）；币种：${currency}；行情截至 ${escapeXml(snapshot.latestTradingDay || "未知日期")}。数据来自 ${sourceLinks}，快照抓取于 ${marketDateTime(snapshot.fetchedAt)}（新加坡时间）。${escapeXml(snapshot.methodNote || "市值、PE和均线可能与其他平台因口径及更新时间不同。")}</p>
  </aside>`;
  return html
    .replace(/<\/head>/i, () => `${snapshotStyle}</head>`)
    .replace(/<main([^>]*)>/i, (_, attrs) => `<main${attrs}>${card}`);
};

const addDiscussionDrawer = (html, brand, date, slug, title) => {
  const threadId = `${date}-${slug}`;
  const reportUrl = `https://f.webbx.space/reports/${threadId}`;
  const accent = readableText(brand.color) === "#16213e" ? "#16213e" : brand.color;
  const discussionStyle = `<style id="discussion-drawer-style">
    .discussion-trigger{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,calc(env(safe-area-inset-bottom) + 12px));z-index:1998;display:inline-flex;align-items:center;gap:9px;min-height:50px;padding:0 18px;border:0;border-radius:999px;color:${readableText(brand.color)};background:${brand.color};box-shadow:0 12px 30px color-mix(in srgb,${brand.color} 34%,transparent);font:800 .88rem/1 "Avenir Next","PingFang SC",sans-serif;letter-spacing:.04em;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}
    .discussion-trigger svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9}
    .discussion-trigger:hover{transform:translateY(-2px);box-shadow:0 15px 34px color-mix(in srgb,${brand.color} 42%,transparent)}
    .discussion-trigger:active{transform:translateY(0)}
    .discussion-trigger:focus-visible,.discussion-close:focus-visible{outline:3px solid color-mix(in srgb,${brand.color} 62%,#fffdf6);outline-offset:3px}
    .discussion-drawer{inset:0 0 0 auto;width:min(440px,100%);max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;background:#fffdf8;color:#182033;box-shadow:-22px 0 70px rgba(17,24,39,.2);overflow:hidden}
    .discussion-drawer[open]{display:grid;grid-template-rows:auto minmax(0,1fr);animation:discussion-in .24s cubic-bezier(.22,1,.36,1)}
    .discussion-drawer::backdrop{background:rgba(18,24,38,.42)}
    .discussion-head{display:flex;align-items:center;gap:14px;padding:18px 18px 16px;border-bottom:1px solid color-mix(in srgb,${brand.color} 20%,#e7e1d5);background:color-mix(in srgb,${brand.color} 6%,#fffdf8)}
    .discussion-head__mark{width:8px;height:36px;background:${brand.color};flex:0 0 auto}
    .discussion-head__copy{min-width:0}
    .discussion-head span{display:block;margin-bottom:3px;color:${accent};font:900 .68rem/1 "Avenir Next","PingFang SC",sans-serif;letter-spacing:.13em;text-transform:uppercase}
    .discussion-head h2{margin:0;color:#182033;font:800 1.18rem/1.25 "Avenir Next","PingFang SC",sans-serif}
    .discussion-close{display:grid;place-items:center;width:44px;height:44px;margin-left:auto;border:0;border-radius:50%;color:#344054;background:transparent;font-size:1.55rem;line-height:1;cursor:pointer}
    .discussion-close:hover{background:color-mix(in srgb,${brand.color} 9%,#f4efe5)}
    .discussion-body{overflow:auto;overscroll-behavior:contain;padding:18px 18px max(28px,env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
    .discussion-status{margin:20px 0;padding:14px 16px;color:#596174;background:#f4f0e7;font:600 .84rem/1.6 "Avenir Next","PingFang SC",sans-serif}
    .discussion-status[data-state="ready"]{display:none}
    .discussion-status[data-state="error"]{color:#8a2d2d;background:#fff0ed}
    #garrul{min-height:220px;--garrul-font:"Avenir Next","PingFang SC",sans-serif;--garrul-accent:${accent};--garrul-link:${accent};--garrul-radius:5px;--garrul-bg:#fffdf8;--garrul-input-bg:#fffdf8;--garrul-surface:#f7f3ea;--garrul-border:#d8d2c6;--garrul-fg:#182033;--garrul-muted:#687086}
    @keyframes discussion-in{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:translateX(0)}}
    @media(max-width:560px){.discussion-trigger{right:max(14px,env(safe-area-inset-right));bottom:max(14px,calc(env(safe-area-inset-bottom) + 10px));min-height:48px;padding:0 16px}.discussion-drawer{width:100%}.discussion-head{padding-top:max(14px,env(safe-area-inset-top))}.discussion-body{padding-inline:15px}}
    @media(prefers-reduced-motion:reduce){.discussion-trigger{transition:none}.discussion-drawer[open]{animation:none}}
  </style>`;
  const discussionMarkup = `<button class="discussion-trigger" type="button" aria-haspopup="dialog" aria-controls="discussion-drawer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z"/></svg><span>讨论</span></button>
  <dialog class="discussion-drawer" id="discussion-drawer" aria-labelledby="discussion-title">
    <header class="discussion-head"><i class="discussion-head__mark" aria-hidden="true"></i><div class="discussion-head__copy"><span>REPORT DISCUSSION</span><h2 id="discussion-title">一起读懂这家公司</h2></div><button class="discussion-close" type="button" aria-label="关闭讨论区">×</button></header>
    <div class="discussion-body"><p class="discussion-status" role="status" aria-live="polite">正在打开讨论区…</p><div id="garrul" data-slug="${escapeXml(threadId)}" data-api="https://comments.f.webbx.space" data-title="${escapeXml(title)}" data-url="${escapeXml(reportUrl)}" data-published="${escapeXml(date)}" data-lang="zh-CN" data-theme="light" data-preset="minimal"></div></div>
  </dialog>
  <script id="discussion-drawer-script">
    (() => {
      const trigger = document.querySelector(".discussion-trigger");
      const drawer = document.getElementById("discussion-drawer");
      const close = drawer?.querySelector(".discussion-close");
      const status = drawer?.querySelector(".discussion-status");
      if (!trigger || !drawer || !close || !status) return;
      let loaded = false;
      let previousOverflow = "";
      const loadDiscussion = () => {
        if (loaded) return;
        loaded = true;
        const script = document.createElement("script");
        script.src = "https://comments.f.webbx.space/embed.js";
        script.async = true;
        script.onload = () => { status.dataset.state = "ready"; };
        script.onerror = () => {
          loaded = false;
          status.dataset.state = "error";
          status.textContent = "讨论区暂时无法连接，财报正文不受影响。请稍后再试。";
        };
        document.body.appendChild(script);
      };
      const open = () => {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        drawer.showModal();
        loadDiscussion();
      };
      trigger.addEventListener("click", open);
      close.addEventListener("click", () => drawer.close());
      drawer.addEventListener("click", (event) => { if (event.target === drawer) drawer.close(); });
      drawer.addEventListener("close", () => {
        document.body.style.overflow = previousOverflow;
        trigger.focus();
      });
    })();
  </script>`;
  return html
    .replace(/<meta name="viewport" content="([^"]*)">/i, (_, content) => `<meta name="viewport" content="${content.includes("viewport-fit") ? content : `${content}, viewport-fit=cover`}">`)
    .replace(/<\/head>/i, `${discussionStyle}</head>`)
    .replace(/<\/body>/i, `${discussionMarkup}</body>`);
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
  const branded = addBrandHeader(html, brand, date, logo);
  const withMarket = addMarketSnapshot(branded, brand, marketData[slug]);
  writeFileSync(join(reportDir, file), addDiscussionDrawer(withMarket, brand, date, slug, title));
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
