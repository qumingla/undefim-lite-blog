import {
  escapeHtml,
  excerptFromHtml,
  formatDate,
  formatShortDate,
  fullUrl
} from "./utils.mjs";

function pageTitle(site, title = "") {
  if (!title) {
    return `${site.title} | ${site.tagline}`;
  }

  return `${title} - ${site.title} | ${site.tagline}`;
}

function topNavigation(activeKey) {
  return [
    { key: "home", label: "首页", href: "/" },
    { key: "dynamic", label: "动态", href: "/categories/ri-chang" },
    { key: "links", label: "友链", href: "/you-lian" },
    { key: "about", label: "关于", href: "/about" }
  ]
    .map(
      (item) => `
        <a class="nav-link ${activeKey === item.key ? "is-active" : ""}" href="${item.href}">
          ${item.label}
        </a>
      `
    )
    .join("");
}

function sidebarProfile(siteData, stats) {
  const { site, posts, categories } = siteData;

  return `
    <section class="card profile-card">
      <div class="profile-head">
        ${
          site.avatar
            ? `<img class="avatar" src="${site.avatar}" alt="${escapeHtml(site.authorName)}">`
            : `<div class="avatar avatar-fallback">${escapeHtml(site.authorName.slice(0, 1))}</div>`
        }
        <h2>${escapeHtml(site.authorName)}</h2>
        <p>${escapeHtml(site.authorMotto)}</p>
        <div class="profile-location">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: -3px; margin-right: 4px;"><path d="M12 23.7279L5.63604 17.364C2.12132 13.8492 2.12132 8.15076 5.63604 4.63604C9.15076 1.12132 14.8492 1.12132 18.364 4.63604C21.8787 8.15076 21.8787 13.8492 18.364 17.364L12 23.7279ZM12 13C13.6569 13 15 11.6569 15 10C15 8.34315 13.6569 7 12 7C10.3431 7 9 8.34315 9 10C9 11.6569 10.3431 13 12 13Z"></path></svg>
          ${escapeHtml(site.authorLocation)}
        </div>
      </div>
      <div class="profile-stats">
        <div>
          <strong>${posts.length}</strong>
          <span>文章</span>
        </div>
        <div>
          <strong>${categories.length}</strong>
          <span>分类</span>
        </div>
        <div>
          <strong>${stats.sitePv || 0}</strong>
          <span>访问</span>
        </div>
      </div>
      <div class="profile-links">
        <a href="mailto:${escapeHtml(site.authorEmail)}" title="邮箱">
          <svg viewBox="0 0 24 24"><path d="M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM20 7.23792L12.0718 14.338L4 7.21594V19H20V7.23792ZM4.51146 5L12.0619 11.662L19.501 5H4.51146Z"></path></svg>
        </a>
        <a href="${escapeHtml(site.github)}" target="_blank" rel="noreferrer" title="GitHub">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.475 2 2 6.475 2 12C2 16.425 4.8625 20.1625 8.8375 21.5C9.3375 21.5875 9.525 21.275 9.525 21.0125C9.525 20.775 9.5125 19.9875 9.5125 19.15C6.7375 19.75 6.15 17.8125 6.15 17.8125C5.6875 16.65 5.0375 16.3375 5.0375 16.3375C4.125 15.7125 5.1 15.725 5.1 15.725C6.1125 15.7875 6.6375 16.7625 6.6375 16.7625C7.5375 18.3 8.9875 17.85 9.5625 17.6C9.65 16.95 9.9125 16.5 10.2 16.2375C7.975 15.9875 5.65 15.125 5.65 11.4375C5.65 10.3875 6.025 9.525 6.675 8.85C6.575 8.6 6.2375 7.625 6.775 6.3125C6.775 6.3125 7.6125 6.05 9.525 7.3375C10.325 7.1125 11.175 7 12 7C12.825 7 13.675 7.1125 14.475 7.3375C16.3875 6.05 17.225 6.3125 17.225 6.3125C17.7625 7.625 17.425 8.6 17.325 8.85C17.975 9.525 18.35 10.3875 18.35 11.4375C18.35 15.1375 16.0125 15.9875 13.7875 16.2375C14.15 16.55 14.475 17.15 14.475 18.1C14.475 19.4625 14.4625 20.5625 14.4625 21.0125C14.4625 21.2875 14.65 21.6 15.175 21.5C19.1375 20.15 22 16.425 22 12C22 6.475 17.525 2 12 2Z"></path></svg>
        </a>
        <a href="https://wpa.qq.com/msgrd?v=3&uin=${escapeHtml(site.qq)}&site=qq&menu=yes" target="_blank" rel="noreferrer" title="QQ">
          <svg viewBox="0 0 24 24"><path d="M12.003 2.03666C15.4854 2.12214 18.4418 4.60673 19.3499 8.01201C19.5316 8.69343 19.6469 9.38707 19.6644 10.0967C19.8654 11.0827 20.2547 12.0227 20.8037 12.8682C22.0911 14.851 22.1834 17.4816 21.0117 19.4938C20.6728 20.0762 19.9856 20.3541 19.3475 20.1873C18.5779 19.9862 17.7712 20.0099 17.0142 20.2524C16.892 20.2915 16.8291 20.4283 16.8824 20.5401C17.3776 21.5796 17.2917 22.8225 16.5937 23.7143C16.1472 24.2847 15.4281 24.2255 14.8686 23.8344C13.2081 22.6738 10.8263 22.6738 9.16584 23.8344C8.60634 24.2255 7.88725 24.2847 7.44079 23.7143C6.74281 22.8225 6.65685 21.5796 7.1521 20.5401C7.20542 20.4283 7.14249 20.2915 7.0203 20.2524C6.26332 20.0099 5.45664 19.9862 4.68695 20.1873C4.04892 20.3541 3.36166 20.0762 3.0228 19.4938C1.85114 17.4816 1.94336 14.851 3.23075 12.8682C3.77983 12.0227 4.1691 11.0827 4.37004 10.0967C4.38755 9.38707 4.50285 8.69343 4.68456 8.01201C5.59273 4.60673 8.54904 2.12214 12.0315 2.03666H12.003Z"></path></svg>
        </a>
      </div>
    </section>
  `;
}

function sidebarNotice(siteData, stats) {
  const categories = siteData.categories
    .map(
      (category) => `
        <a class="sidebar-category" href="/categories/${escapeHtml(category.slug)}">
          <span>${escapeHtml(category.name)}</span>
          <strong>${siteData.posts.filter((post) => post.categorySlug === category.slug).length}</strong>
        </a>
      `
    )
    .join("");

  const recentLinks = siteData.friendLinks
    .slice(0, 4)
    .map(
      (link) => `
        <a class="friend-mini" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
          ${
            link.avatar
              ? `<img src="${escapeHtml(link.avatar)}" alt="${escapeHtml(link.name)}">`
              : `<span class="friend-fallback">${escapeHtml(link.name.slice(0, 1))}</span>`
          }
          <span>${escapeHtml(link.name)}</span>
        </a>
      `
    )
    .join("");

  return `
    <section class="card notice-card">
      <div class="card-head">
        <h3>${escapeHtml(siteData.site.noticeTitle || "公告")}</h3>
      </div>
      <div class="card-body article-body">
        ${siteData.site.noticeBodyHtml || ""}
      </div>
    </section>
    <section class="card sidebar-card">
      <div class="card-head">
        <h3>站点统计</h3>
      </div>
      <div class="sidebar-metrics">
        <div><span>总访问</span><strong>${stats.sitePv || 0}</strong></div>
        <div><span>独立访客</span><strong>${stats.siteUv || 0}</strong></div>
        <div><span>文章数量</span><strong>${siteData.posts.length}</strong></div>
      </div>
    </section>
    <section class="card sidebar-card">
      <div class="card-head">
        <h3>分类</h3>
      </div>
      <div class="sidebar-stack">
        ${categories || '<p class="empty">暂无分类</p>'}
      </div>
    </section>
    <section class="card sidebar-card">
      <div class="card-head">
        <h3>友链速览</h3>
      </div>
      <div class="sidebar-stack">
        ${recentLinks || '<p class="empty">暂无友链</p>'}
      </div>
    </section>
  `;
}

function footer(siteData, stats) {
  return `
    <footer class="site-footer">
      <div class="footer-brand">
        ${
          siteData.site.logo
            ? `<img src="${siteData.site.logo}" alt="${escapeHtml(siteData.site.title)}">`
            : `<span>${escapeHtml(siteData.site.title)}</span>`
        }
      </div>
      <div class="footer-copy">
        <p>© ${new Date().getFullYear()} ${escapeHtml(siteData.site.title)}</p>
        <p>建站于 ${formatShortDate(siteData.site.foundedAt)} · ${stats.siteUv || 0} 位访客 · ${stats.sitePv || 0} 次访问</p>
      </div>
    </footer>
  `;
}

function layout({
  siteData,
  stats,
  title,
  description,
  activeKey,
  currentPath,
  mainContent
}) {
  const { site } = siteData;

  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(pageTitle(site, title))}</title>
      <meta name="description" content="${escapeHtml(description || site.description)}">
      <meta name="theme-color" content="${escapeHtml(site.themeColor || "#00c7fc")}">
      <link rel="canonical" href="${escapeHtml(fullUrl(site.url, currentPath))}">
      <link rel="stylesheet" href="/styles.css">
      <script defer src="/site.js"></script>
      <style>
        :root {
          --accent: ${escapeHtml(site.themeColor || "#00c7fc")};
          --bg-image: url("${escapeHtml(site.backgroundImage || "")}");
        }
      </style>
    </head>
    <body>
      <div class="scene-dust" aria-hidden="true"></div>
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="/">
            ${
              site.logo
                ? `<img src="${site.logo}" alt="${escapeHtml(site.title)}">`
                : `<span>${escapeHtml(site.title)}</span>`
            }
          </a>
          <nav class="nav">${topNavigation(activeKey)}</nav>
          <form class="search-bar" action="/search" method="get">
            <input name="q" type="search" placeholder="搜索文章 / 关键词" aria-label="搜索">
            <button type="submit">搜索</button>
          </form>
        </div>
      </header>
      <main class="page-shell">
        <aside class="page-side left-side">
          ${sidebarProfile(siteData, stats)}
        </aside>
        <section class="page-main">
          ${mainContent}
        </section>
        <aside class="page-side right-side">
          ${sidebarNotice(siteData, stats)}
        </aside>
      </main>
      ${footer(siteData, stats)}
      <button class="mode-toggle" id="mode-toggle" type="button" aria-label="切换主题">◐</button>
      <button class="back-to-top" id="back-to-top" type="button" aria-label="返回顶部">↑</button>
    </body>
  </html>`;
}

function renderPostMeta(post, stats, path) {
  const views = stats.pageViews?.[path] || 0;
  const category = post.categorySlug
    ? `<a href="/categories/${escapeHtml(post.categorySlug)}">${escapeHtml(post.categoryName || post.categorySlug)}</a>`
    : "";

  return `
    <div class="post-meta">
      <span>${formatDate(post.publishedAt)}</span>
      <span>${views} 次访问</span>
      ${category ? `<span>${category}</span>` : ""}
      ${post.updatedAt ? `<span>更新于 ${formatShortDate(post.updatedAt)}</span>` : ""}
    </div>
  `;
}

function renderPostCard(post, stats) {
  const path = `/archives/${post.slug}`;
  return `
    <article class="card post-card">
      <div class="card-body">
        <h2 class="post-card-title">
          ${post.pinned ? '<span class="pin-badge">置顶</span>' : ""}
          <a href="${path}">${escapeHtml(post.title)}</a>
        </h2>
        ${renderPostMeta(post, stats, path)}
        <p class="post-excerpt">${escapeHtml(post.excerpt || excerptFromHtml(post.contentHtml))}</p>
      </div>
    </article>
  `;
}

function renderPagination(basePath, currentPage, totalPages) {
  if (totalPages <= 1) {
    return "";
  }

  const pageHref = (page) => (page === 1 ? basePath : `${basePath}/page/${page}`);

  const items = Array.from({ length: totalPages }, (_, index) => index + 1)
    .map(
      (page) => `
        <a class="page-link ${page === currentPage ? "is-current" : ""}" href="${pageHref(page)}">
          ${page}
        </a>
      `
    )
    .join("");

  return `
    <nav class="pagination">
      ${
        currentPage > 1
          ? `<a class="page-nav" href="${pageHref(currentPage - 1)}">上一页</a>`
          : `<span class="page-nav is-disabled">上一页</span>`
      }
      <div class="page-links">${items}</div>
      ${
        currentPage < totalPages
          ? `<a class="page-nav" href="${pageHref(currentPage + 1)}">下一页</a>`
          : `<span class="page-nav is-disabled">下一页</span>`
      }
    </nav>
  `;
}

export function renderHomePage({ siteData, stats, pagination, currentPath }) {
  const cards = pagination.items.map((post) => renderPostCard(post, stats)).join("");

  const content = `
    <section class="card hero-card">
      <div class="card-body hero-body">
        <p class="hero-kicker">undefi.me · 轻量重构版</p>
        <h1>${escapeHtml(siteData.site.title)}</h1>
        <p>${escapeHtml(siteData.site.description)}</p>
      </div>
    </section>
    ${cards}
    ${renderPagination("", pagination.currentPage, pagination.totalPages)}
  `;

  return layout({
    siteData,
    stats,
    title: "",
    description: siteData.site.description,
    activeKey: "home",
    currentPath,
    mainContent: content
  });
}

export function renderPostPage({ siteData, stats, post, previousPost, nextPost, currentPath }) {
  const content = `
    <article class="card article-card">
      <div class="card-body">
        <h1 class="article-title">${escapeHtml(post.title)}</h1>
        ${renderPostMeta(post, stats, currentPath)}
        <div class="article-body">${post.contentHtml || ""}</div>
      </div>
    </article>
    <nav class="card article-nav">
      <div class="card-body article-nav-grid">
        ${
          previousPost
            ? `<a href="/archives/${escapeHtml(previousPost.slug)}">← ${escapeHtml(previousPost.title)}</a>`
            : `<span class="muted">没有更早的文章了</span>`
        }
        ${
          nextPost
            ? `<a href="/archives/${escapeHtml(nextPost.slug)}">${escapeHtml(nextPost.title)} →</a>`
            : `<span class="muted right">没有更新的文章了</span>`
        }
      </div>
    </nav>
  `;

  return layout({
    siteData,
    stats,
    title: post.title,
    description: post.excerpt || excerptFromHtml(post.contentHtml),
    activeKey: "home",
    currentPath,
    mainContent: content
  });
}

export function renderCategoryPage({ siteData, stats, category, posts, currentPath }) {
  const cards = posts.map((post) => renderPostCard(post, stats)).join("");
  const content = `
    <section class="card section-card">
      <div class="card-body">
        <div class="section-head">
          <span class="section-label">分类</span>
          <h1>${escapeHtml(category.name)}</h1>
          <p>${posts.length} 篇文章</p>
        </div>
      </div>
    </section>
    ${cards}
  `;

  return layout({
    siteData,
    stats,
    title: `分类：${category.name}`,
    description: `${category.name} 分类归档`,
    activeKey: category.slug === "ri-chang" ? "dynamic" : "home",
    currentPath,
    mainContent: content
  });
}

export function renderStaticPage({ siteData, stats, page, currentPath, activeKey }) {
  const content = `
    <article class="card article-card">
      <div class="card-body">
        <h1 class="article-title">${escapeHtml(page.title)}</h1>
        <div class="post-meta">
          ${page.publishedAt ? `<span>${formatDate(page.publishedAt)}</span>` : ""}
          ${page.updatedAt ? `<span>更新于 ${formatShortDate(page.updatedAt)}</span>` : ""}
        </div>
        <div class="article-body">${page.contentHtml || ""}</div>
      </div>
    </article>
  `;

  return layout({
    siteData,
    stats,
    title: page.title,
    description: excerptFromHtml(page.contentHtml),
    activeKey,
    currentPath,
    mainContent: content
  });
}

export function renderLinksPage({ siteData, stats, currentPath }) {
  const linkCards = siteData.friendLinks
    .map(
      (link) => `
        <a class="friend-card" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
          ${
            link.avatar
              ? `<img src="${escapeHtml(link.avatar)}" alt="${escapeHtml(link.name)}">`
              : `<span class="friend-fallback">${escapeHtml(link.name.slice(0, 1))}</span>`
          }
          <div>
            <strong>${escapeHtml(link.name)}</strong>
            <span>${escapeHtml(link.url)}</span>
          </div>
        </a>
      `
    )
    .join("");

  const page = siteData.pages.links;

  const content = `
    <article class="card article-card">
      <div class="card-body">
        <h1 class="article-title">${escapeHtml(page.title)}</h1>
        <div class="post-meta">
          ${page.publishedAt ? `<span>${formatDate(page.publishedAt)}</span>` : ""}
          ${page.updatedAt ? `<span>更新于 ${formatShortDate(page.updatedAt)}</span>` : ""}
        </div>
        <div class="friend-grid">
          ${linkCards || '<p class="empty">暂无友链</p>'}
        </div>
        <div class="article-body links-body">${page.contentHtml || ""}</div>
      </div>
    </article>
  `;

  return layout({
    siteData,
    stats,
    title: page.title,
    description: excerptFromHtml(page.contentHtml),
    activeKey: "links",
    currentPath,
    mainContent: content
  });
}

export function renderSearchPage({ siteData, stats, query, results, currentPath }) {
  const body = results.length
    ? results.map((post) => renderPostCard(post, stats)).join("")
    : `<section class="card empty-card"><div class="card-body"><p>没有匹配 “${escapeHtml(query)}” 的内容。</p></div></section>`;

  const content = `
    <section class="card section-card">
      <div class="card-body">
        <div class="section-head">
          <span class="section-label">搜索</span>
          <h1>${escapeHtml(query || "站内搜索")}</h1>
          <p>${results.length} 条结果</p>
        </div>
      </div>
    </section>
    ${body}
  `;

  return layout({
    siteData,
    stats,
    title: query ? `搜索：${query}` : "搜索",
    description: `搜索 ${query}`,
    activeKey: "home",
    currentPath,
    mainContent: content
  });
}

export function renderNotFound({ siteData, stats, currentPath }) {
  const content = `
    <section class="card empty-card">
      <div class="card-body">
        <h1>404</h1>
        <p>页面不存在，可能已经移动或删除。</p>
        <a class="button-link" href="/">返回首页</a>
      </div>
    </section>
  `;

  return layout({
    siteData,
    stats,
    title: "404",
    description: "页面不存在",
    activeKey: "home",
    currentPath,
    mainContent: content
  });
}

function adminLayout({ title, adminBase, body }) {
  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)}</title>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body class="admin-page">
      <main class="admin-shell">
        <aside class="admin-nav">
          <h1>后台</h1>
          <a href="${adminBase}">概览</a>
          <a href="${adminBase}/settings">站点设置</a>
          <a href="${adminBase}/pages/about">关于页</a>
          <a href="${adminBase}/pages/links">友链页</a>
          <a href="${adminBase}/friend-links">友链列表</a>
          <a href="${adminBase}/posts/new">新建文章</a>
          <form action="${adminBase}/logout" method="post">
            <button type="submit">退出登录</button>
          </form>
        </aside>
        <section class="admin-main">
          ${body}
        </section>
      </main>
    </body>
  </html>`;
}

export function renderAdminLogin({ adminBase, hasDefaultPassword, errorMessage = "" }) {
  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>后台登录</title>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body class="admin-login-page">
      <main class="login-card">
        <h1>后台登录</h1>
        <p>这个入口不会在前台显示，未登录访客不可见。</p>
        ${errorMessage ? `<p class="form-error">${escapeHtml(errorMessage)}</p>` : ""}
        ${
          hasDefaultPassword
            ? '<p class="form-warn">当前仍在使用默认后台密码，请尽快设置 `BLOG_ADMIN_PASSWORD`。</p>'
            : ""
        }
        <form method="post" action="${adminBase}/login" class="admin-form">
          <label>用户名<input type="text" name="username" value="admin" autocomplete="username"></label>
          <label>密码<input type="password" name="password" autocomplete="current-password"></label>
          <button type="submit">登录</button>
        </form>
      </main>
    </body>
  </html>`;
}

export function renderAdminDashboard({ adminBase, siteData, stats }) {
  const rows = siteData.posts
    .map(
      (post) => `
        <tr>
          <td><a href="/archives/${escapeHtml(post.slug)}" target="_blank" rel="noreferrer">${escapeHtml(post.title)}</a></td>
          <td>${escapeHtml(post.categoryName || "-")}</td>
          <td>${formatShortDate(post.publishedAt)}</td>
          <td>${stats.pageViews?.[`/archives/${post.slug}`] || 0}</td>
          <td><a href="${adminBase}/posts/${escapeHtml(post.slug)}">编辑</a></td>
        </tr>
      `
    )
    .join("");

  return adminLayout({
    title: "后台概览",
    adminBase,
    body: `
      <section class="admin-panel">
        <h2>站点概览</h2>
        <div class="admin-stats">
          <div><span>文章</span><strong>${siteData.posts.length}</strong></div>
          <div><span>分类</span><strong>${siteData.categories.length}</strong></div>
          <div><span>访问</span><strong>${stats.sitePv || 0}</strong></div>
          <div><span>访客</span><strong>${stats.siteUv || 0}</strong></div>
        </div>
      </section>
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>文章管理</h2>
          <a class="button-link" href="${adminBase}/posts/new">新建文章</a>
        </div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>分类</th>
              <th>发布日期</th>
              <th>访问</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5">暂无文章</td></tr>'}</tbody>
        </table>
      </section>
    `
  });
}

export function renderAdminSettings({ adminBase, site }) {
  return adminLayout({
    title: "站点设置",
    adminBase,
    body: `
      <section class="admin-panel">
        <h2>站点设置</h2>
        <form method="post" action="${adminBase}/settings" class="admin-form">
          <label>站点标题<input type="text" name="title" value="${escapeHtml(site.title)}"></label>
          <label>副标题<input type="text" name="tagline" value="${escapeHtml(site.tagline)}"></label>
          <label>描述<textarea name="description">${escapeHtml(site.description)}</textarea></label>
          <label>站点地址<input type="text" name="url" value="${escapeHtml(site.url)}"></label>
          <label>主题色<input type="text" name="themeColor" value="${escapeHtml(site.themeColor)}"></label>
          <label>背景图<input type="text" name="backgroundImage" value="${escapeHtml(site.backgroundImage)}"></label>
          <label>Logo<input type="text" name="logo" value="${escapeHtml(site.logo)}"></label>
          <label>头像<input type="text" name="avatar" value="${escapeHtml(site.avatar)}"></label>
          <label>作者<input type="text" name="authorName" value="${escapeHtml(site.authorName)}"></label>
          <label>个签<input type="text" name="authorMotto" value="${escapeHtml(site.authorMotto)}"></label>
          <label>地区<input type="text" name="authorLocation" value="${escapeHtml(site.authorLocation)}"></label>
          <label>邮箱<input type="text" name="authorEmail" value="${escapeHtml(site.authorEmail)}"></label>
          <label>备用邮箱<input type="text" name="backupEmail" value="${escapeHtml(site.backupEmail)}"></label>
          <label>QQ<input type="text" name="qq" value="${escapeHtml(site.qq)}"></label>
          <label>GitHub<input type="text" name="github" value="${escapeHtml(site.github)}"></label>
          <label>公告标题<input type="text" name="noticeTitle" value="${escapeHtml(site.noticeTitle)}"></label>
          <label>公告内容 HTML<textarea name="noticeBodyHtml">${escapeHtml(site.noticeBodyHtml)}</textarea></label>
          <label>后台路径<input type="text" name="adminPath" value="${escapeHtml(site.adminPath || "/dashboard")}"></label>
          <button type="submit">保存设置</button>
        </form>
      </section>
    `
  });
}

export function renderAdminPageEditor({ adminBase, pageKey, page }) {
  return adminLayout({
    title: `${page.title} 编辑`,
    adminBase,
    body: `
      <section class="admin-panel">
        <h2>${escapeHtml(page.title)}</h2>
        <form method="post" action="${adminBase}/pages/save" class="admin-form">
          <input type="hidden" name="pageKey" value="${escapeHtml(pageKey)}">
          <label>标题<input type="text" name="title" value="${escapeHtml(page.title)}"></label>
          <label>发布日期<input type="text" name="publishedAt" value="${escapeHtml(page.publishedAt || "")}"></label>
          <label>更新日期<input type="text" name="updatedAt" value="${escapeHtml(page.updatedAt || "")}"></label>
          <label>正文 HTML<textarea name="contentHtml" class="editor-area">${escapeHtml(page.contentHtml || "")}</textarea></label>
          <button type="submit">保存页面</button>
        </form>
      </section>
    `
  });
}

export function renderAdminPostEditor({ adminBase, post, isNew }) {
  return adminLayout({
    title: isNew ? "新建文章" : `编辑：${post.title}`,
    adminBase,
    body: `
      <section class="admin-panel">
        <h2>${isNew ? "新建文章" : `编辑：${escapeHtml(post.title)}`}</h2>
        <form method="post" action="${adminBase}/posts/save" class="admin-form">
          <input type="hidden" name="originalSlug" value="${escapeHtml(post.slug || "")}">
          <label>标题<input type="text" name="title" value="${escapeHtml(post.title || "")}"></label>
          <label>Slug<input type="text" name="slug" value="${escapeHtml(post.slug || "")}"></label>
          <label>分类名<input type="text" name="categoryName" value="${escapeHtml(post.categoryName || "")}"></label>
          <label>分类 Slug<input type="text" name="categorySlug" value="${escapeHtml(post.categorySlug || "")}"></label>
          <label>摘要<textarea name="excerpt">${escapeHtml(post.excerpt || "")}</textarea></label>
          <label>发布日期<input type="text" name="publishedAt" value="${escapeHtml(post.publishedAt || "")}"></label>
          <label>更新日期<input type="text" name="updatedAt" value="${escapeHtml(post.updatedAt || "")}"></label>
          <label class="checkbox-line"><input type="checkbox" name="pinned" ${post.pinned ? "checked" : ""}> 置顶</label>
          <label>正文 HTML<textarea name="contentHtml" class="editor-area">${escapeHtml(post.contentHtml || "")}</textarea></label>
          <button type="submit">${isNew ? "创建文章" : "保存文章"}</button>
        </form>
        ${
          isNew
            ? ""
            : `
              <form method="post" action="${adminBase}/posts/delete" class="admin-form admin-danger">
                <input type="hidden" name="slug" value="${escapeHtml(post.slug)}">
                <button type="submit">删除文章</button>
              </form>
            `
        }
      </section>
    `
  });
}

export function renderAdminFriendLinks({ adminBase, friendLinks }) {
  return adminLayout({
    title: "友链编辑",
    adminBase,
    body: `
      <section class="admin-panel">
        <h2>友链列表</h2>
        <form method="post" action="${adminBase}/friend-links/save" class="admin-form">
          <label>友链 JSON<textarea name="friendLinksJson" class="editor-area">${escapeHtml(
            JSON.stringify(friendLinks, null, 2)
          )}</textarea></label>
          <button type="submit">保存友链</button>
        </form>
      </section>
    `
  });
}
