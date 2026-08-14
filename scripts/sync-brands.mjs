import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as simpleIcons from "simple-icons";

const root = new URL("../", import.meta.url).pathname;
const reportsDir = join(root, "outputs/financial-reports");
const brandsFile = join(root, "src/brands.json");
const assetsDir = join(root, "src/brand-assets");
const brands = existsSync(brandsFile) ? JSON.parse(readFileSync(brandsFile, "utf8")) : {};

mkdirSync(assetsDir, { recursive: true });

const slugs = [...new Set(readdirSync(reportsDir)
  .map((name) => name.match(/^\d{4}-\d{2}-\d{2}-(.+)\.html$/)?.[1])
  .filter(Boolean))];

const spacedName = (slug) => slug.replace(/([a-z])([A-Z])/g, "$1 $2");
const fallbackColor = (slug) => {
  let hash = 0;
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 64% 42%)`;
};
const normalize = (value) => String(value || "")
  .toLowerCase()
  .replace(/&/g, "and")
  .replace(/[^a-z0-9]/g, "");
const exportName = (slug) => `si${slug[0].toUpperCase()}${slug.slice(1)}`;

const icons = Object.values(simpleIcons).filter((value) => value && value.slug && value.path);

const findIcon = (slug, brand = {}) => {
  if (brand.simpleIcon && simpleIcons[brand.simpleIcon]?.path) {
    return { key: brand.simpleIcon, icon: simpleIcons[brand.simpleIcon] };
  }
  const names = [slug, brand.query, spacedName(slug)].map(normalize).filter(Boolean);
  const exactSlug = icons.find((icon) => names.includes(normalize(icon.slug)));
  if (exactSlug) return { key: exportName(exactSlug.slug), icon: exactSlug };
  const exactTitle = icons.find((icon) => names.includes(normalize(icon.title)));
  if (exactTitle) return { key: exportName(exactTitle.slug), icon: exactTitle };
  const partial = icons
    .map((icon) => {
      const title = normalize(icon.title);
      const slugName = normalize(icon.slug);
      const hit = names.some((name) => (
        (title.length >= 4 && (name.includes(title) || title.includes(name)))
        || (slugName.length >= 4 && (name.includes(slugName) || slugName.includes(name)))
      ));
      return hit ? { icon, len: Math.max(title.length, slugName.length) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.len - a.len)[0];
  if (partial) return { key: exportName(partial.icon.slug), icon: partial.icon };
  return null;
};

let changed = false;
for (const slug of slugs) {
  const current = brands[slug] || {};
  const match = findIcon(slug, current);
  const next = {
    company: current.company || spacedName(slug),
    query: current.query || spacedName(slug),
    color: current.color || (match ? `#${match.icon.hex}` : fallbackColor(slug))
  };
  if (match) next.simpleIcon = match.key;
  if (current.override) next.override = current.override;
  if (JSON.stringify(brands[slug] || {}) !== JSON.stringify(next)) {
    brands[slug] = next;
    changed = true;
  }
}

if (changed) writeFileSync(brandsFile, `${JSON.stringify(brands, null, 2)}\n`);
console.log(`Brand metadata ready: ${slugs.length}`);
