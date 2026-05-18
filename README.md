# Undefi Lite Blog

一个零依赖 Node 博客，按 `https://undefi.me` 当前样式做了轻量复刻，保留：

- 文章列表、文章详情、分类页、关于页
- 搜索
- 访客统计
- 友链
- 隐藏后台
- 主题切换、点击烟花、背景氛围等前端特效

## 启动

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

## Docker Compose

先准备环境变量：

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

## 数据位置

- 站点内容：`storage/site.json`
- 访客统计：`storage/stats.json`
- 镜像资源：`public/mirror/`

## 说明

- `storage/site.json` 是主要内容源，后台修改会直接写回这个文件。
- `storage/stats.json` 会随着访问实时更新，默认已加入 `.gitignore`。
- 导入器会优先镜像原站资源；如果原站里某些外部图片或失效附件无法下载，会保留原链接，不阻塞整体迁移。
