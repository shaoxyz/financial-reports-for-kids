# 给孩子也看得懂的财报

每天用约 15 分钟，读懂一家全球知名公司的生意、护城河、竞争对手、行业和风险。

网站：<https://f.webbx.space>

## 本地查看

```bash
npm run build
npm run preview
```

打开 <http://localhost:4173>。

## 新增报告

把独立 HTML 报告放入 `outputs/financial-reports/`，文件名格式为：

```text
YYYY-MM-DD-Company.html
```

运行 `npm run build` 后，首页和 `public/reports/` 会自动更新。

## 品牌素材

构建时用本地 simple-icons 匹配 Logo，并把 SVG 内联进页面，不请求 Wikimedia 或其他外网图片。找不到对应 icon 时会生成文字标识。若某个公司需要手动指定 Logo，把 SVG 放到 src/brand-assets/，并在 src/brands.json 里给该公司加上 override 文件名。

Logo 记录在 src/brands.json。Simple Icons 的 SVG path 为 CC0；Logo 和商标权利归各自品牌所有，仅用于识别报告涉及的公司，不包含在本项目的 MIT 许可范围内。

## 内容原则

- 财报原文只使用公司投资者关系网站、交易所或监管机构文件。
- 清楚区分财报事实、外部背景和分析判断。
- 用简单中文解释公司如何赚钱、壁垒、竞争和风险。
- 仅用于商业与财报教育，不构成投资建议。

## 许可

[MIT](LICENSE)
