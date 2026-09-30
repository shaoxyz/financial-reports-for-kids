# 云端每日报告发布合同

dot 云调度负责研究、撰写、更新品牌资料，通过 GitHub 的 blob/tree/commit/update_ref（force=false）把以下文件**一次原子提交到 main**。不假设云任务有 shell、工作目录或本机登录。

- `outputs/financial-reports/YYYY-MM-DD-Slug.html`：新加坡发布日期的独立报告，官方资料来源在正文列出。
- `src/brands.json`：只更新当日公司，保留其他公司；行情代码用 `marketSymbol` 或 `dataSymbol`。行业放 manifest，不放 brands（品牌同步会丢弃未知字段）。
- 如需要，提交 `src/brand-assets/` 内使用的 SVG/PNG。
- `publishing/manifest.json`：严格四个字段，`schemaVersion: 1`、`date`（真实日期）、`slug`（字母开头的英文字母/数字，沿用现有大小写）、`industry`（不超过80字符的中文行业）。文件名由 `date` 和 `slug` 推导。示例见现有 Paychex manifest。

提交前读取当前 main，重新合并最新 brands，保留67篇已有报告与全部行情数据。若 update_ref 非快进冲突，重新读取 main 再合并，不强推。同一报告的日期、slug、行业在 receipt 建立后保持不变。云任务不修改 `src/market-data.json`、`publishing/market-attempts/`、工作流或部署配置；不读取 Secrets，不自行调用部署或行情服务。

工作流名称 **Publish financial report**，文件 `.github/workflows/publish-financial-report.yml`。仅 main 内容推送及在 main 上的 `workflow_dispatch` 可部署；功能分支推送不触发。无需新建 GitHub 令牌，使用工作流自身的 `GITHUB_TOKEN`、`contents: write`。其提交不递归触发 push 工作流。生产组串行、不取消运行中的发布；若 main 在发布过程中前进，失败退出，由新的运行或 main 上的手动运行处理最新提交。

Actions 使用 Node22、`npm ci`、品牌同步。它先写入 `publishing/market-attempts/YYYY-MM-DD-Slug.json` 的 `reserved` 记录并成功推回 main，再执行当日公司一次 `npm run market:update -- --slug Slug`，不用 `--force`。更新器最多发两个请求；结果与快照一起提交。既有同报告日期的快照直接复用（初次 Paychex），不请求 API。失败或进程中断后，后续运行转为/保留 `unavailable` 并披露行情暂缺；部署重试跨日也不再请求。保留其他公司的快照，失败时也不删除旧数据，但当前失败报告不展示旧行情冒充新快照。

预留成功但获取/结果提交前进程终止时，系统宁可披露缺失，也不会再消耗额度。成功结果持久化后，可随时手动重试部署。不能用删除 receipt 或 `--force` 绕过日额度保护。若 main 写入被分支保护拒绝，工作流失败且预留前不发请求；父任务需核查仓库策略。

持久状态的 `schemaVersion` 是1，包含原始 `manifest`、`status`（reserved/captured/unavailable）、`attemptedAt` 和非秘密 `reason`。成功还记录 `snapshotFetchedAt`、`snapshotSha256`。行业从这些 receipt 保留到后续首页构建。

部署使用独立的 `wrangler.ci.jsonc`，同一个已有静态 Worker/账号/兼容日期/404设置，不含 routes、domains 或 triggers。只运行 `versions upload --tag FULL_SHA --message ...`，解析 Wrangler NDJSON 的 `version-upload.version_id`，然后 `versions deploy ID@100% --yes`。不运行普通 `deploy` 或 `triggers deploy`，不修改已有 `f.webbx.space/*` 路由；专用令牌仅授予 `financial-reports-for-kids` 的 Editor。权限失败直接停止，不扩大权限、不创建资源。原本地部署配置保留。

构建使用已持久提交的精确 HEAD SHA，构建后要求 tracked files 无修改。`public/deployment.json` 公共标记包含 `schemaVersion`、`commit`（40位 SHA）、`reportId`、`reportPath`、`sourceReportSha256`、`marketStatus`、`snapshotFetchedAt`；每份 HTML 的 `<meta name="deployment-sha" content="FULL_SHA">` 标识相同提交。上线验收检查 Cloudflare版本的 SHA tag、最新部署100%版本ID、首页报告链接、报告页及相同 SHA 标记。成功后 Actions 摘要和 publication artifact 留下版本ID与提交SHA。

两个仓库 Actions Secrets：`CLOUDFLARE_API_TOKEN`、`ALPHA_VANTAGE_API_KEY`，由用户亲自填写。账号ID已在非秘密 CI 配置中指定。首次上线用现有 `2026-09-30-Paychex.html`，不新增文章；先验证重复运行不改行情，成功后父任务再监督暂停原本地任务。

官方依据：
- https://developers.cloudflare.com/workers/authorization/workers/
- https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/#versions-upload
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
