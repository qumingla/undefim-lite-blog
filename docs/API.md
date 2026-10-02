# API 参考

核对日期：2026-10-02。注册入口：[server/index.mjs](../server/index.mjs)。Base URL 为同源 `/api`；下表写完整路径。暂无 OpenAPI 文件与独立版本前缀。

## 通用约定与认证

JSON 请求使用 `Content-Type: application/json`；文件用 multipart/form-data，浏览器 FormData 不手动设置 boundary。返回通常为 JSON；导出、备份下载返回 ZIP。正常新建/任务提交也返回 200，不是 201/202。异步操作返回 `{ "job": "任务ID" }`，必须轮询任务直至 success/failed，不能收到 ID 就报告发布成功。

登录返回 username/ csrf，同时写入 `blog_session` Cookie：HttpOnly、SameSite=Strict、Path=/api、7 天；除 COOKIE_SECURE=false 外启用 Secure。数据库保存 Token 哈希；密码为 scrypt 盐化哈希。GET session 可重新获得 csrf。管理员写接口必须同时带 Cookie 和 `X-CSRF-Token`。

所有 POST/PUT/PATCH/DELETE 如果带 Origin，则必须等于 ADMIN_ORIGIN，未设置时等于服务判断的协议和 Host。缺失 Origin 并非全局拒绝，管理员接口仍要求 CSRF。开发跨端口访问要正确设置 Origin，见运维文档。无公开注册、权限角色管理或多用户管理 UI。

错误常见为 `{ "message": "说明" }`：400 输入错误，401 未登录/密码错误，403 来源或 CSRF/评论开关限制，404 不存在，409 显式编辑冲突/导入路径冲突，429 限流，5xx 服务错误。并非所有数据库唯一约束冲突都返回 409，当前统一处理可能返回 400。所有 `/api/` 响应 no-store。

请求体限制：JSON 3MiB；multipart 单文件 40MiB、20 文件、20 字段；正式 Nginx 整个请求最多 42m。因此不能把单文件上限乘以文件数当作生产总额度。

## 公开与认证接口

| 方法 | 路径 | 请求 | 响应/限制 |
| --- | --- | --- | --- |
| GET | `/api/health` | 无 | `{ok:true}`；仅存活检查，不能代替发布版本/证书验收 |
| POST | `/api/auth/login` | `{username,password}`，最长 100/256 | `{username,csrf}` + Cookie；8 次/15 分钟 |
| GET | `/api/auth/session` | 登录 Cookie | `{username,csrf}` |
| POST | `/api/auth/logout` | Cookie + CSRF | `{ok:true}`，删除当前会话及 Cookie |
| POST | `/api/auth/password` | `{current,password}` + 鉴权 | `{ok:true}`；新密码 14–256 字符，删除其他会话 |
| GET | `/api/public/documents/:id/comments` | 公开当前版本的文档 ID | 已通过评论数组：id/author/content/created_at/parent_id；不含邮箱 |
| POST | `/api/public/documents/:id/comments` | `{author,email?,content,website?}` | `{ok:true}`，待审核；3 次/10 分钟 |
| POST | `/api/public/documents/:id/visit` | 无正文 | `{visits,likes}`；30 次/分钟，Cookie 1 小时去重 |
| POST | `/api/public/documents/:id/like` | 无正文 | `{visits,likes}`；10 次/分钟，Cookie 365 天去重 |

评论 author 去首尾空白后 1–60 字符，content 1–5000；email 可省略、空或合法邮箱；website 最长 200，是蜜罐字段，非空时返回成功但不写入。关闭评论返回 403。当前提交接口不接收 parent_id；保留历史回复关系不代表已实现新的嵌套回复功能。限流为进程内实现；Cookie 去重不提供强身份或防作弊保证。

以下其余接口均需管理员登录；写方法均需 CSRF。

## 文档与历史版本

| 方法 | 路径 | 输入 | 返回与语义 |
| --- | --- | --- | --- |
| GET | `/api/documents` | 可选 `?deleted=true` | 文档数组；默认非回收站，true 只列回收站；无分页 |
| GET | `/api/documents/:id` | ID | 完整草稿 Document |
| POST | `/api/documents` | DocumentInput | 新草稿 Document |
| PUT | `/api/documents/:id` | 完整 DocumentInput，可附 updatedAt | Document + unpublishJob（任务 ID 或 null）；不是局部 PATCH；时间戳不匹配为 409 |
| POST | `/api/documents/:id/publish` | 无正文 | `{job}`；只接受公开且不在回收站的文档 |
| POST | `/api/documents/:id/unpublish` | 无正文 | `{job}`；成功构建后撤回 |
| POST | `/api/documents/:id/trash` | 无正文 | `{job}`；立即标回收站并排队撤回 |
| POST | `/api/documents/:id/restore` | 无正文 | Document；清除回收站标记，不构建 |
| GET | `/api/documents/:id/revisions` | 无 | `[{id,created_at,reason}]`，时间倒序 |
| GET | `/api/documents/:id/revisions/:revision` | 无 | `{id,document_id,data,created_at,reason}`，data 已解析 |
| POST | `/api/documents/:id/revisions/:revision/restore` | 无正文 | Document；恢复为草稿，保留当前固定链接 |

DocumentInput：

| 字段 | 类型、约束与默认 |
| --- | --- |
| kind | 必填 `post` / `page` |
| title | 必填字符串，trim 后 1–500 |
| path | 必填站内绝对路径，见下文 |
| format | 必填 `markdown` / `html` |
| markdown | 必填字符串，最多 2000000 字符；两种格式都使用这个字段 |
| date | 必填字符串，Date.parse 可解析 |
| modifiedAt | 可选日期字符串；新建/更新接口实际写当前时间 |
| categories | 字符串数组，每项 <=100，最多 20，默认 [] |
| tags | 字符串数组，每项 <=100，最多 50，默认 [] |
| excerpt | <=2000，默认空串 |
| cover | 安全 URL，默认空串 |
| pinned | boolean，默认 false |
| allowComment | boolean，默认 true |
| visibility | public/private，默认 public |
| author | <=100，默认 undefim |
| copyrightEnabled | boolean，默认 true；关闭隐藏整块作者/链接/许可区域 |
| licenseName | trim 后 1–100，默认 CC BY 4.0 |
| licenseUrl | 安全 URL 或空串，默认 https://creativecommons.org/licenses/by/4.0/；空串显示纯文本 |
| licenseNote | trim 后 <=1000，允许空串，默认“转载请注明出处。” |

许可字段为每篇文章/页面独立设置，保存草稿后仍需发布。历史内容没有这些字段时读取默认值；旧版本恢复时也回到默认 CC BY 4.0，不沿用当前自定义许可。MD 导入和内容导出的 Front Matter 保留这四个字段。

PUT 保存私密内容且仍有公开快照时自动排队取消发布，响应 `unpublishJob` 为任务 ID；否则为 null。该字段仅为响应元数据，不进入文章 JSON。须轮询任务成功才确认前台下线；失败可重试保存或取消发布，旧公开版本暂时保留。

Document 追加 id、published、deletedAt、updatedAt，可能保留迁移元数据。PUT 应发送完整表单值及最新 updatedAt；省略有默认值的字段会回到默认值。updatedAt 冲突校验是可选字段触发，不能省略后仍声称防止并发覆盖。

path 必须以 `/` 开始，不可为根；不含 query/hash、反斜线、控制符、空段、`.`、`..` 或百分号编码；首段不能为 admin/api/assets/upload/categories/tags/page/index/search/rss.xml/sitemap.xml/search-index.json。这不是所有构建页面的完整冲突探测器，新增路径仍需检查静态路由。URL 字段最长 2000，允许空串、单斜线开头的站内路径、HTTP(S)，拒绝协议相对地址及引号/尖括号/反斜线/控制符。

完整新建示例：

```json
{
  "kind": "post",
  "title": "维护示例",
  "path": "/archives/maintenance-example",
  "format": "markdown",
  "markdown": "# 正文\n\n文章内容。",
  "date": "2026-10-02T02:00:00.000Z",
  "categories": ["技术"],
  "tags": ["维护"],
  "excerpt": "示例摘要",
  "cover": "",
  "pinned": false,
  "allowComment": true,
  "visibility": "public",
  "author": "undefim"
}
```

## 预览、导入、媒体与评论管理

| 方法 | 路径 | 输入 | 返回 |
| --- | --- | --- | --- |
| POST | `/api/preview` | `{source,format}`，source <=2000000，format markdown/html | `{html}`，经过安全清洗；不保存 |
| POST | `/api/import` | multipart，通常重复 files 字段，.md 或 .zip | `{documents:Document[],job:null或ID}` |
| GET | `/api/media` | 无 | 媒体数组，按 created_at 倒序 |
| POST | `/api/media` | multipart files | 媒体数组，每项 id/name/path/type/size/sha256/created_at |
| GET | `/api/comments` | 无 | 原评论字段 + path/document_title，含后台可见 email |
| PATCH | `/api/comments/:id` | `{status,content?}` | `{ok:true}`；status approved/pending/hidden，content <=5000 |

导入无更新/覆盖模式，遇到同批或已有路径（含回收站）冲突为 409。自动发布由设置控制；导入不读取 Front Matter 的私密标记。文件上限、支持格式和相对引用限制见 [数据模型](DATA-MODEL.md)。没有媒体删除接口，不能假设 DELETE `/api/media/:id` 可用。评论修改立即影响动态列表；静态摘要计数需要另行构建。

## 设置、构建和备份

| 方法 | 路径 | 输入 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/settings` | 无 | 合并默认值的设置对象 |
| PUT | `/api/settings` | 部分允许的键 | 完整设置；无自动构建 |
| POST | `/api/build` | 无正文 | `{job}`；按已发布快照重新生成站点 |
| GET | `/api/jobs` | 无 | 最近 50 条 Job |
| GET | `/api/jobs/:id` | 无 | Job |
| GET | `/api/export` | 无 | application/zip，文件名 blog-content.zip |
| POST | `/api/backup` | 无正文 | `{name:"日期-UUID.zip"}` |
| GET | `/api/backups/:name` | 合法 ZIP 基础文件名 | ZIP 下载；需要登录 |

设置键：title、description、author、bio、location、announcement、email、github、qq、startDate、umamiWebsiteId（字符串 <=3000）；avatar/logo/background（URL）；accent（六位十六进制色）；cardOpacity（0.5–1）；importAutoPublish（boolean）；navigation、categories、tags、links；assetMap（迁移资源映射，目前缺少专门结构校验，不能存放秘密）。只接收 defaultSettings 中的键，其他键被忽略；公开构建导出这些默认键，不应把 Token 加入其中。

- navigation：最多 20 个 `{label<=40,href:URL}`。
- categories/tags：各最多 1000 个 `{id?,name,slug,description?,color?,children?,hidden?}`；name 1–100，slug 1–150 且只含 Unicode 字母/数字/点/下划线/连字符，同组 slug 不重复，description <=2000，children 为字符串数组。
- links：最多 300 个 `{name<=100,url:URL,logo?:URL}`。
- 分类按稳定 ID 改名会同步草稿和 published_data，历史版本不改；静态版本仍需构建。

Job 示例（urls 当前是字符串，不是数组）：

```json
{"id":"job-id","status":"success","created_at":"2026-10-02T02:00:00.000Z","finished_at":"2026-10-02T02:00:05.000Z","log":"静态版本切换完成。","urls":"[\"/archives/example\"]"}
```

## 客户端调用流程示例

仅在隔离测试环境运行写入示例。真实后台已有封装，位于 `admin/src/main.tsx`，优先复用。

```js
// 浏览器同源环境；已通过登录页面建立 Cookie。
const session = await fetch('/api/auth/session').then(r => r.json());
async function write(route, body) {
  const r = await fetch('/api' + route, {
    method: 'POST',
    headers: {'X-CSRF-Token': session.csrf,
      ...(body instanceof FormData ? {} : {'Content-Type':'application/json'})},
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.message);
  return result;
}
const form = new FormData();
form.append('files', new File(['# 示例正文'], 'example.md', {type:'text/markdown'}));
const imported = await write('/import', form);
// 默认草稿；确认内容后按需调用 /documents/<id>/publish。
// 若 imported.job 非空，则轮询 /api/jobs/<id>，成功后再验收公开页面。
```

接口增加/修改时同步更新此文档及调用方，涉及隐私和发布行为还必须更新数据模型与回归测试。
