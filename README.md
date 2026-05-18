# undefim-lite-blog

一个零依赖、可自托管的轻量博客，按 `https://undefi.me` 当前站点做了重构式复刻，保留博客常用能力，去掉 Halo 这类重平台的运行负担。

## 特性

- 三栏卡片式博客首页、文章详情页、分类页、关于页、友链页
- 本地全文搜索
- 访客统计和页面访问量统计
- 隐藏后台，不在前台暴露入口
- 后台可直接编辑站点设置、页面、文章和友链
- 原站资源镜像导入，尽量减少外部依赖
- 主题切换、背景氛围、点击烟花等前端特效
- 原生 Node.js 运行，无第三方 npm 依赖
- 支持 Docker Compose 部署

## 技术栈

- Node.js 24
- 原生 `http` 服务
- JSON 文件存储
- 原生 HTML + CSS + 少量前端脚本

## 快速开始

### 本地运行

```bash
npm run import
BLOG_ADMIN_PASSWORD='your-strong-password' \
BLOG_ADMIN_PATH='/dashboard-unsafe-to-guess' \
npm start
```

默认地址：

- 前台：`http://127.0.0.1:4321`
- 后台：`http://127.0.0.1:4321/dashboard`

如果设置了 `BLOG_ADMIN_PATH`，后台路径会变成你指定的值。

### Docker Compose

```bash
cp .env.example .env
```

至少把下面两个值改掉：

- `BLOG_ADMIN_PASSWORD`
- `BLOG_ADMIN_PATH`

启动：

```bash
docker compose up -d --build
```

停止：

```bash
docker compose down
```

如果你想在容器里重新抓一次线上内容：

```bash
docker compose run --rm blog npm run import
```

Compose 会持久化这两个目录：

- `./storage`
- `./public/mirror`

## 项目结构

```text
.
├── public/            # 样式、前端脚本、镜像资源
├── scripts/           # 导入和校验脚本
├── src/               # 服务端路由、渲染、存储层
├── storage/           # 站点内容和统计数据
├── server.mjs         # 应用入口
├── compose.yml        # Docker Compose 配置
└── Dockerfile         # 容器镜像定义
```

## 数据说明

- `storage/site.json` 是站点主内容源，后台修改会直接写回这里。
- `storage/stats.json` 记录访客和页面访问量，默认不会提交到 Git。
- `public/mirror/` 保存导入时镜像下来的站点资源。

## 开发与校验

代码检查：

```bash
npm run check
```

这个检查会验证：

- 站点 JSON 结构是否可用
- 服务端与脚本文件是否通过 Node 语法检查
- CI 是否能在无依赖安装的前提下跑通

## 内容导入

默认会从 `https://undefi.me` 导入数据：

```bash
npm run import
```

也可以改成别的源站：

```bash
SOURCE_URL='https://example.com' npm run import
```

导入器会优先镜像源站资源；如果遇到外部图片或已失效附件，会保留原链接而不是中断整个迁移流程。

## 后台说明

- 默认后台用户：`admin`
- 默认后台路径：`/dashboard`
- 生产环境必须修改：
  - `BLOG_ADMIN_PASSWORD`
  - `BLOG_ADMIN_PATH`

## Release

首个版本说明见 [docs/releases/v1.0.0.md](/Users/mac/.gemini/antigravity/playground/blog/docs/releases/v1.0.0.md)。
