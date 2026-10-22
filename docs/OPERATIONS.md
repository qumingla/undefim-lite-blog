# 开发、部署与运行维护

基线：2026-10-02。本文只描述通用部署流程；真实主机、证书、账号、备份位置和生产记录仅保留在私有环境。

## 本地开发

使用 Node 24 LTS（>=24.22.1 <25）与 npm；`.node-version` 固定当前安全基线 24.22.1，须用版本管理器或官方安装包实际切换运行时，修改文件不会升级系统 Node。原生 SQLite 不依赖另装数据库服务。运行 `npm ci` 保持锁文件一致。不要在默认生产数据副本上试写入，使用独立目录：

```sh
npm ci
DATA_DIR=./data-dev node scripts/create-admin.mjs
DATA_DIR=./data-dev ASTRO_TELEMETRY_DISABLED=1 npm run build
DATA_DIR=./data-dev COOKIE_SECURE=false npm start
```

`.gitignore` 已忽略 `data/`、`data-*/`、环境文件（保留 `.env.example`）、数据库、密钥、备份归档及迁移报告/截图；`.dockerignore` 同样排除开发数据和部署预览包。使用其他开发数据目录时，先补充忽略规则。

这是空站开发环境，默认 API/整站地址 http://127.0.0.1:4322 ，后台 `/admin/`。首次凭据保存在 `data-dev/admin-access.txt`；不要输出到公共日志。create-admin 默认用户名 undefim，随机密码；可从环境传 ADMIN_NAME/ADMIN_PASSWORD，新密码至少 14 字符，已有同名账户会报错，不是密码重置脚本。首次登录修改密码后删除初始凭据文件。

前台热更新：`DATA_DIR=./data-dev npm run dev`，读取数据库已发布快照。Astro 默认 4321，**其开发服务器没有自动代理动态 API**；评论/计数功能联调使用 4322 上完整构建后的站点。后台热更新使用两个终端：

```sh
# 终端一：API，Origin 对应后台 Vite 地址
DATA_DIR=./data-dev COOKIE_SECURE=false ADMIN_ORIGIN=http://127.0.0.1:4323 npm run dev:api
```

```sh
# 终端二
npm run dev:admin
```

后台 Vite 监听 4323，把 /api、/upload、/assets 代理到 4322。此时写请求来源要与 ADMIN_ORIGIN 匹配，localhost 和 127.0.0.1 不能混用。只想验证整体流程时优先同源 4322，避免开发代理差异。

只有在全新隔离数据库上才运行 Halo 导入；示例中的备份路径须换成自己有权读取的文件：

```sh
DATA_DIR=./data-dev node scripts/import-halo.mjs /absolute/path/to/halo-backup.zip
```

导入拒绝已有 documents 的库。原始 ZIP 含私密内容，不能放在 public/。日常发文使用后台 MD/ZIP 导入，不再运行迁移脚本。

## 源码仓库

仓库：https://github.com/qumingla/undefim-lite-blog ，默认分支 `main`。2026-10-02 用当前独立博客源码完整替换旧版本目录，保留 Git 历史用于追溯；旧版本文件不混入当前目录。公开仓库仅含代码、依赖锁文件、公开主题资源、示例和维护文档。`migration/reports/`、`migration/screenshots/` 与原始备份保留在本地，文档中的这些路径是本地证据位置，不保证在克隆后存在。

推送前检查 `git diff --cached --stat` 和待提交文件；不能使用 `git add -f` 绕过私有数据忽略规则。更新 GitHub 不会自动更新正式服务器，生产部署仍按下文执行。

## 环境变量

| 变量 | 默认值与示例 | 生效范围与注意 |
| --- | --- | --- |
| DATA_DIR | 本地 ./data；容器 /app/data | 数据库、媒体、备份、release；以进程工作目录解析 |
| HOST / PORT | 127.0.0.1 / 4322；容器 HOST=0.0.0.0 | API 监听，Compose 仅绑定宿主机回环地址 |
| NODE_ENV | 容器 production | Fastify 生产日志 |
| SITE_URL | 示例 https://blog.example.com；实际默认值见配置 | 构建 canonical/RSS/sitemap/跳转，需要重新发布 |
| ADMIN_ORIGIN | 示例 https://blog.example.com | 精确 Origin 校验，无结尾斜杠；空值使用请求协议和 Host |
| COOKIE_SECURE | 默认 true | 仅独立 HTTP 开发/隧道预览为 false |
| TRUST_PROXY | 仅字符串 true 启用 | Compose 开启；应用端口必须保持受可信代理保护 |
| TRACKING_ENABLED | 生产 false | 仅 true 且设置有 umamiWebsiteId 才在构建中加入脚本 |
| CLOUDFLARE_ZONE_ID | 未配置 | 可选区域缓存刷新 |
| CLOUDFLARE_API_TOKEN | 未配置，秘密 | 最小范围区域缓存清除权限；只放受保护环境 |
| CONTENT_SNAPSHOT | 发布器设置 | 指定本次 content.json，不手工指向含私密正文的全集 |
| BUILD_DIR | dist/site | 发布器设置为 release/site |
| ASTRO_TELEMETRY_DISABLED | 构建建议 1 | 禁用 Astro 遥测 |
| ADMIN_NAME / ADMIN_PASSWORD | undefim / 随机生成 | create-admin 脚本使用；不要在命令行明文写密码 |

`npm start` 和 dev:api 使用 Node 的 `--env-file-if-exists=.env`；直接执行脚本、Astro 构建和其他工具不能一概假设自动加载同样的环境。Compose `.env` 用于变量插值，只将 compose.yaml 列出的项目传入容器；ADMIN_PASSWORD 等不在其默认传入列表中。

## 验证范围

| 命令/检查 | 覆盖与边界 |
| --- | --- |
| `npm test` | 15 项测试（9 项核心、2 项背景动画、4 项排版安全）：临时数据目录覆盖草稿/公开隔离、路径、Markdown 清洗、ZIP、鉴权/邮箱隐私、缓存、构建失败与并发草稿、许可协议兼容/导出恢复、私密保存自动撤回与失败重试；动画生命周期；YAML/JSON 兼容、元数据不执行代码、别名限额、公式清洗、畸形 Markdown 引用在独立进程内限时完成 |
| `npm run check` | tsc；后端 JS 的 checkJs=false，不能代替运行测试 |
| `DATA_DIR=./data-dev ASTRO_TELEMETRY_DISABLED=1 npm run build` | 前台和后台可构建；使用隔离内容集 |
| `npm audit` | 依赖风险核查，记录执行时间和输出，不能永久保证无漏洞 |
| 浏览器多宽度 | 按架构文档断点，包含完整桌面三栏、后台编辑、长正文、搜索与图片 |
| `node scripts/verify-workflow.mjs` | 固定请求本机 4325，读取 data/admin-access.txt，创建/编辑/发布/回收测试文章；仅用于已搭建的隔离 QA，结束仍留回收站记录 |
| `node scripts/verify-preview.mjs https://blog.example.com` | 登录、读接口、预览、退出，写本地报告；固定断言历史迁移数据基线，使用前需改为自己环境的核验基线；改密或删凭据文件后不能直接运行 |
| `npm run backup:verify` | 创建新备份、临时恢复、integrity_check、核心表数量与媒体 SHA-256 对比，输出 data 下报告 |

迁移验收报告记录的是当时结果。纯文档变更不需要运行写入流程或重部署；不把旧报告当作本次新验证。

### 2026-10-22 安全核查与升级

对照 10 月 21 日 [Node.js 官方安全公告](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)与 [PHP 官方公告](https://www.php.net/archive/2026.php#2026-10-21-5)，核查当前源码、锁文件和本地运行时：

| 对象 | 核查结论与修复 |
| --- | --- |
| PHP CVE-2026-109618 / CVE-2026-109619 | 项目无 PHP 源码/服务，Compose 与代理模板不连接 PHP-FPM，因此本项目无直接 PHP 暴露面；未检查宿主机其他服务 |
| Node.js 24.x | 检查时本地 v24.8.0，低于官方安全版 24.22.1；更新 engines、版本文件及 Docker 基线。公告包括 Brotli 解码内存写越界、DNS/TLS/HTTP 等问题；实际可利用性取决于所用 API 和输入，不能仅凭依赖版本声称博客已遭入侵 |
| markdown-it | 14.3.2 → 14.3.3，修复 [CVE-2026-111758](https://github.com/advisories/GHSA-gfr2-rv44-r23c) 及内联 HTML 的二次复杂度问题；预览/发布启用 HTML，需更新 |
| sanitize-html / KaTeX | 2.18.0 → 2.18.1 / 0.16.47 → 0.18.10；修复 iframe 回退递归风险及原型污染前提下的信任绕过；继续保留 trust=false 和 HTML 清洗 |
| Vite / http-cache-semantics | 后台 6.4.3 → 6.4.5、Astro 内嵌 8.3.2 → 8.3.5 / 4.2.0 → 4.3.0；更新开发服务器、编辑器调用与缓存补丁。正式 HTTP 服务使用 Fastify，开发服务器仍只绑定回环地址 |
| Fastify | 5.12.5 → 5.12.7，声明最低 5.12.6；另对照 [GHSA-389g-gv7q-r4x8](https://github.com/fastify/fastify/security/advisories/GHSA-389g-gv7q-r4x8) 核实请求头 propertyNames 大小写校验绕过。项目当前未使用该 schema 条件，仍更新补丁；此次 npm audit 未列出这项，不能只依赖自动审计 |
| gray-matter 依赖链 | 移除 gray-matter / js-yaml 3 / argparse 1 / sprintf-js，使用已有 yaml 库解析 Front Matter；限制见 [数据模型](DATA-MODEL.md)。不采用 audit 建议降级到 gray-matter 2 的方案 |

当日联网 `npm audit` 从 9 项告警（3 high、5 moderate、1 low，含传递影响）降至 0；这只覆盖当时 npm 公告库，不覆盖 Node 内置组件、系统包或真实服务器。依赖构建和测试使用临时下载并经官方 SHA-256 校验的 Node 24.22.1；系统默认 Node 未修改。

Dockerfile 固定 `node:24.22.1-bookworm-slim`；后续安全升级需显式更新该标签并验证。更新代码后，在已授权的目标环境按下节保留回退点，用 `sudo docker compose build --pull blog` 再执行 `sudo docker compose up -d --no-build blog`；核验 `sudo docker compose exec blog node --version`、健康接口与后台。排版依赖改变后还需重新发布静态站点，确认任务 success 并检查正文/公式。旧容器不会因源码变化自动获得运行时修复；回退保留当前数据库和新增内容，优先使用安全运行时上的兼容代码，避免恢复已知有漏洞的运行时。

源码修复阶段未连接正式服务器。随后在用户授权下，已将合并后的修复部署到正式博客，重建 Docker 镜像并显式重新发布静态站点；实测容器 Node 24.22.1、Fastify 5.12.7、markdown-it 14.3.3、sanitize-html 2.18.1、KaTeX 0.18.10，实际容器的 npm audit 为 0。保留原有生产环境变量，源码包不包含数据库、媒体或凭据。

部署前完成 SQLite 备份临时恢复和媒体 SHA-256 校验，保留旧源码/环境、Nginx 配置、镜像及停止写入后的完整 data 归档。在唯一博客实例停止期间，用同一 Compose 环境的临时容器重建已发布快照，任务 success 后恢复服务。对比部署前后核心内容表，文章、历史版本、设置、评论、媒体、用户及重定向记录一致；SQLite integrity_check 为 ok，公开快照与数据库已发布内容一致，搜索索引只含已发布文章。未执行迁移导入或发布草稿。

线上容器 healthy、发布队列为空；HTTPS 首页、文章、搜索、RSS、站点地图、后台和健康接口实测通过，后台/API 保持 no-store。首页及长文章在两种主题、360/390/767/768/1199/1200/1440/1920px 共 32 个组合通过布局检查，核验桌面/手机截图、哈希资产可达且无页面脚本异常。运行配置未启用自动 CDN 清理，公开域名已实际核验；第三方缓存仍可能按既有有效期更新。主机信息、精确回退点与证据保存在被忽略的私有报告中。

生产 Nginx 配置测试通过；本次博客部署不代表已完成宿主机全部系统包或其他服务的漏洞审计，不能把博客依赖审计结果扩大为整机安全结论。

另查 [Nginx 官方公告](https://nginx.org/en/security_advisories.html)：当前模板不使用 alias/rewrite 组合、AIO 或 HTTP/3，但不能据此代替运行中完整配置与发行版补丁核查。应在目标环境检查 Nginx 版本、发行版包修订及编译模块，并私下核对完整配置；不要把可能含敏感配置的 `nginx -T` 输出写入公开报告，也不要仅按上游版本号判断带安全回补的发行版包。

## 正式环境与发布步骤

使用支持 Docker Compose 的 Linux 主机。项目目录由部署者自行选择；Docker service=blog；数据目录挂载 `/app/data`。镜像安装 devDependencies，因为发布需要 Astro 构建器；不能为缩小镜像直接删去。镜像构建生成后台；启动运行 initialize，再启动 API。Compose 限制 2CPU/2GB、drop capabilities、日志 10m × 3，容器使用 UID1000。

1. 在隔离数据上验证修改；备份当前源码/镜像、`.env`、Nginx 与完整数据，并确认可以恢复。保留最新用户写入。
2. 上传所需源码和文档，**不要用开发数据库或预览包的 .env 覆盖正式数据/环境**。确保新数据目录归 UID1000；已有正常权限无需每次递归改权限。
3. 在服务器应用目录执行：

```sh
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=100 blog
curl --fail http://127.0.0.1:4322/api/health
```

4. 后台、API 更新随容器生效。已有 `data/current/site/index.html` 时 initialize 不重新生成前台；模板、样式、SITE_URL、公开设置更改后，在后台执行“发布站点”（POST /api/build），等待任务 success。它不会发布未发布草稿。
5. 验收公开域名首页、文章、搜索、RSS、手机/完整桌面、后台登录和缓存头；核对任务日志。如本次只更新文档，则无需构建/重启服务。

如后台会话不可用，维护者可在备份且队列为空后停止唯一 blog 实例，使用同一 Compose 环境的临时容器调用 enqueueBuild()（不传文章变更）并等待 settledBuilds()，核对 jobs.status 为 success 后恢复 blog。停止与恢复期间会有短暂维护窗口；数据目录可能归容器 UID1000 且为 700，只读校验需通过容器或已授权 sudo，不应放宽权限。必须保证失败也恢复服务；不要在 API 正常运行时另起发布器，因为模块初始化会将已有 queued/running 标记为失败，并形成多个写实例。该方式只重建已发布快照，不需要读取管理员初始凭据。

健康检查每 30 秒调用 /api/health，启动宽限 90 秒；健康不代表前台版本已更新。

### Nginx 与 TLS

反向代理模板见 [deploy/nginx.conf](../deploy/nginx.conf) 和 [deploy/nginx-oracle.conf](../deploy/nginx-oracle.conf)。必须替换其中的域名、证书路径和部署环境参数，不能直接覆盖现有配置。HTTP 跳转到 HTTPS，443 代理到 127.0.0.1:4322；后台/API 禁用代理缓存。

证书和私钥由部署者在服务器私有目录管理，续期机制按实际证书供应商配置。变更后执行 `sudo nginx -t`，通过后再 `sudo systemctl reload nginx`；公开文档不记录实际证书路径、私钥或同步凭据。

### CDN 和缓存

源站缓存响应头不代表 CDN 已缓存 HTML；DNS 代理、缓存规则和缓存刷新凭据均由部署者自行配置。

| 资源 | Cache-Control |
| --- | --- |
| /api/、/admin/ | no-store |
| /upload/、/_astro/ | public, max-age=31536000, immutable |
| /assets/ | public, max-age=86400 |
| HTML、RSS、搜索索引等 | public, max-age=0, s-maxage=300, stale-while-revalidate=60 |

以后启用橙云时使用适合有效源站证书的 Full (strict)，明确绕过后台/API与鉴权流量；HTML 是否在边缘缓存还取决于 Cloudflare Cache Rules。配置受限 Token 后发布器才会清除整个 zone 缓存，可能影响同一区域其他缓存资源。源站发布成功不等于 purge 成功；检查日志和响应头。不要覆盖已有唯一媒体 URL，换文件应换 URL。

### 旧预览打包脚本

`scripts/package-deployment.mjs` 是迁移阶段敏感预览包生成器：包含数据库、媒体和初始凭据，清除的是复制库中的 sessions/jobs，自动写 COOKIE_SECURE=false。它当前不复制 docs/、AGENTS.md、MIGRATION-STATUS.md 和正式 Nginx 配置；不是通用生产部署管线。本次文档不要依赖它分发，随源码单独复制。该打包目录还可能保留旧文件，运行前必须阅读源码和检查 staging，不能盲目发布产物。本次文档工作没有运行它。

## 备份、恢复和回滚

后台“完整备份”或 `sudo docker compose exec blog npm run backup` 生成私有 ZIP；`backup:verify` 会额外做恢复验证。备份目录 700、ZIP 600。内容导出不是全量备份；完整备份含账号哈希、会话、私密文章和评论邮箱，离线/异地副本也须受保护。当前没有自动异地备份和保留策略。

恢复采用新数据目录：

1. 停止写入并保留恢复前的最新完整备份、代码版本和环境；停止容器，防止旧 WAL 干扰。
2. 在非公开临时目录解压可信备份，检查 manifest、SQLite integrity_check 和媒体校验；将 blog.sqlite 与 media 放入**全新**数据目录，不混入旧 WAL/SHM。
3. 保留原 data 整目录作为回退副本，把新目录放到 Compose 的 data 挂载位置并设置 UID1000。恢复目录不复制旧 current/releases，让 initialize 根据恢复库生成匹配版本。
4. SQLite 全库备份可能含会话；按恢复策略使旧会话失效。启动兼容此库 schema 的代码，等待首次构建成功，再验收公开/私密、媒体、后台和静态索引。
5. 如使用 CDN，清除旧页面缓存；检查新建一次备份能通过验证。不要在恢复成功前删除原目录。

只回滚代码：保留当前数据与新增文章，恢复兼容的代码/镜像并构建站点。只回切 current 符号链接不会自动同步 published_data，不是完整内容回滚。恢复旧备份会丢失备份后的写入，必须先保存增量并制定合并方式。

切换回旧系统前先导出并核对切换后的新增/修改内容，再恢复入口和旧服务，避免丢失新文章。实际回退点、备份位置和环境副本只保存在私有运维记录，不写入公开仓库。

## 常见问题定位

| 症状 | 先检查 |
| --- | --- |
| 更新代码后前台没变化 | 是否完成后台“发布站点”；current 指向、job 日志、CDN/浏览器缓存 |
| 保存成功但文章没更新 | 保存只是草稿；是否发布对应文档、捕获版本是否早于最后编辑 |
| 私密/删除后仍看见旧页 | 撤回任务是否成功，active snapshot 与缓存；修改草稿不能即时撤回 |
| 后台 403 | CSRF 是否刷新，Origin 与 ADMIN_ORIGIN 的协议/域名/端口是否完全一致 |
| HTTP 开发环境登录失效 | Secure Cookie 配置与 URL，Path=/api、浏览器 Cookie；生产不能改为 false |
| 发布失败 | 任务日志、剩余磁盘、内存、路径冲突、Astro 依赖；旧站通常继续服务 |
| 上传 413 / 超限 | Nginx 42m、multipart 40MiB、MD/ZIP 解压限额同时存在 |
| 媒体 404 | data/media 路径、assetMap、迁移缺失清单；不直接伪造原件 |
| 突然退出后版本不一致 | current/content.json、published_data、jobs、release；按一致性边界恢复 |
| 磁盘持续增加 | releases、保留哈希资产、backups、媒体与 Docker 日志；无应用层自动保留策略 |
