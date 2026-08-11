import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import * as simpleIcons from "simple-icons";

const root = new URL("../", import.meta.url).pathname;
const reportsDir = join(root, "outputs/financial-reports");
const brandsFile = join(root, "src/brands.json");
const assetsDir = join(root, "src/brand-assets");
const brands = JSON.parse(readFileSync(brandsFile, "utf8"));
const userAgent = "FinancialReportsForKids/1.0 (https://github.com/shaoxyz/financial-reports-for-kids)";

mkdirSync(assetsDir, { recursive: true });

const slugs = [...new Set(readdirSync(reportsDir)
  .map((name) => name.match(/^\d{4}-\d{2}-\d{2}-(.+)\.html$/)?.[1])
  .filter(Boolean))];

const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const spacedName = (slug) => slug.replace(/([a-z])([A-Z])/g, "$1 $2");
const fallbackColor = (slug) => {
  let hash = 0;
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 64% 42%)`;
};

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function discoverBrand(slug) {
  const query = spacedName(slug);
  try {
    const searchUrl = new URL("https://www.wikidata.org/w/api.php");
    searchUrl.search = new URLSearchParams({ action: "wbsearchentities", search: query, language: "en", format: "json", limit: "5", origin: "*" });
    const search = await fetchJson(searchUrl);
    const match = search.search?.find((item) => /company|corporation|business|bank|airline|brand|technology|pharmaceutical|telecommunication/i.test(item.description || "")) || search.search?.[0];
    if (!match) throw new Error("no company match");
    const entity = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${match.id}.json`);
    const claims = entity.entities[match.id].claims;
    return {
      company: query,
      query,
      color: fallbackColor(slug),
      wikidataId: match.id,
      wikimediaFile: claims?.P154?.[0]?.mainsnak?.datavalue?.value
    };
  } catch {
    return { company: query, query, color: fallbackColor(slug) };
  }
}

async function saveAsset(slug, brand) {
  if (brand.simpleIcon && simpleIcons[brand.simpleIcon]) {
    const icon = simpleIcons[brand.simpleIcon];
    const asset = `${slug}.svg`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${escapeXml(brand.query)}"><path fill="#${icon.hex}" d="${icon.path}"/></svg>\n`;
    writeFileSync(join(assetsDir, asset), svg);
    return { asset, logoSource: `https://simpleicons.org/?q=${encodeURIComponent(icon.title)}` };
  }

  if (brand.wikimediaFile) {
    const extension = extname(brand.wikimediaFile).toLowerCase() || ".svg";
    const asset = `${slug}${extension}`;
    const destination = join(assetsDir, asset);
    if (!existsSync(destination)) {
      const url = `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(brand.wikimediaFile)}`;
      const response = await fetch(url, { headers: { "User-Agent": userAgent } });
      if (!response.ok) throw new Error(`${response.status} ${brand.wikimediaFile}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 100) throw new Error(`invalid logo ${brand.wikimediaFile}`);
      writeFileSync(destination, bytes);
    }
    return { asset, logoSource: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(brand.wikimediaFile.replaceAll(" ", "_"))}` };
  }

  const asset = `${slug}.svg`;
  const label = escapeXml(brand.query || spacedName(slug));
  writeFileSync(join(assetsDir, asset), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 180" role="img" aria-label="${label}"><text x="20" y="120" fill="${brand.color}" font-family="Arial, sans-serif" font-size="76" font-weight="700">${label}</text></svg>\n`);
  return { asset, logoSource: "generated-wordmark" };
}

let changed = false;
for (const slug of slugs) {
  if (!brands[slug]) {
    brands[slug] = await discoverBrand(slug);
    changed = true;
  }
  const assetInfo = await saveAsset(slug, brands[slug]);
  if (brands[slug].asset !== assetInfo.asset || brands[slug].logoSource !== assetInfo.logoSource) {
    Object.assign(brands[slug], assetInfo);
    changed = true;
  }
}

if (changed) writeFileSync(brandsFile, `${JSON.stringify(brands, null, 2)}\n`);
console.log(`Brand assets ready: ${slugs.length}`);
