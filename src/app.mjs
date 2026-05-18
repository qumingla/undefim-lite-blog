import { readFileSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import {
  excerptFromHtml,
  normalizeAdminPath,
  paginate,
  parseCookies,
  parseForm,
  randomId,
  readRequestBody,
  redirect,
  sendHtml
} from "./utils.mjs";
import { getRootDir, loadSiteData, loadStats, saveSiteData, saveStats } from "./store.mjs";
import {
  renderAdminDashboard,
  renderAdminFriendLinks,
  renderAdminLogin,
  renderAdminPageEditor,
  renderAdminPostEditor,
  renderAdminSettings,
  renderCategoryPage,
  renderHomePage,
  renderLinksPage,
  renderNotFound,
  renderPostPage,
  renderSearchPage,
  renderStaticPage
} from "./render.mjs";

const rootDir = getRootDir();
const publicDir = join(rootDir, "public");
const sessions = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

function adminPath(siteData) {
  return normalizeAdminPath(process.env.BLOG_ADMIN_PATH || siteData.site.adminPath || "/dashboard");
}

function adminPassword() {
  return process.env.BLOG_ADMIN_PASSWORD || "change-me-now";
}

function adminUser() {
  return process.env.BLOG_ADMIN_USER || "admin";
}

function syncCategories(siteData) {
  const seen = new Map();

  for (const post of siteData.posts) {
    if (!post.categorySlug && !post.categoryName) {
      continue;
    }
    const slug = post.categorySlug || post.categoryName;
    if (!seen.has(slug)) {
      seen.set(slug, {
        slug,
        name: post.categoryName || slug
      });
    }
  }

  siteData.categories = [...seen.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

function cleanSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.createdAt > 1000 * 60 * 60 * 24 * 7) {
      sessions.delete(token);
    }
  }
}

function isAuthenticated(request) {
  cleanSessions();
  const cookies = parseCookies(request.headers.cookie);
  const sessionToken = cookies.blog_admin_session;
  return Boolean(sessionToken && sessions.has(sessionToken));
}

function ensureVisitTracking(request, response, stats, pathKey) {
  const cookies = parseCookies(request.headers.cookie);
  let visitorId = cookies.visitor_id;
  const headers = {};

  if (!visitorId) {
    visitorId = randomId(10);
    stats.siteUv += 1;
    headers["Set-Cookie"] = `visitor_id=${visitorId}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } else if (!stats.recentVisitors[visitorId]) {
    stats.siteUv += 1;
  }

  stats.sitePv += 1;
  stats.pageViews[pathKey] = (stats.pageViews[pathKey] || 0) + 1;
  stats.recentVisitors[visitorId] = Date.now();

  const visitorEntries = Object.entries(stats.recentVisitors).sort((left, right) => right[1] - left[1]);
  stats.recentVisitors = Object.fromEntries(visitorEntries.slice(0, 5000));

  saveStats(stats);

  if (headers["Set-Cookie"]) {
    response.setHeader("Set-Cookie", headers["Set-Cookie"]);
  }
}

function matchRoute(pathname, pattern) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];
    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = pathPart;
      continue;
    }
    if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

function serveStatic(pathname, response) {
  if (pathname === "/" || !extname(pathname)) {
    return false;
  }

  const safePath = pathname === "/" ? "" : pathname.replace(/^\/+/, "");
  const targetPath = resolve(publicDir, safePath);

  if (!targetPath.startsWith(resolve(publicDir)) || !existsSync(targetPath)) {
    return false;
  }

  const extension = extname(targetPath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": "public, max-age=604800"
  });
  response.end(readFileSync(targetPath));
  return true;
}

async function handleAdmin(request, response, url, siteData) {
  const base = adminPath(siteData);
  const pathname = url.pathname;
  const authed = isAuthenticated(request);
  const hasDefaultPassword = adminPassword() === "change-me-now";

  if (pathname === `${base}/login` && request.method === "GET") {
    sendHtml(response, renderAdminLogin({ adminBase: base, hasDefaultPassword }));
    return;
  }

  if (pathname === `${base}/login` && request.method === "POST") {
    const form = parseForm(await readRequestBody(request));
    if (form.username === adminUser() && form.password === adminPassword()) {
      const token = randomId(16);
      sessions.set(token, { createdAt: Date.now() });
      redirect(response, base, 302, {
        "Set-Cookie": `blog_admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
      });
      return;
    }

    sendHtml(
      response,
      renderAdminLogin({
        adminBase: base,
        hasDefaultPassword,
        errorMessage: "用户名或密码错误"
      }),
      401
    );
    return;
  }

  if (!authed) {
    redirect(response, `${base}/login`);
    return;
  }

  if (pathname === `${base}/logout` && request.method === "POST") {
    const cookies = parseCookies(request.headers.cookie);
    if (cookies.blog_admin_session) {
      sessions.delete(cookies.blog_admin_session);
    }
    redirect(response, `${base}/login`, 302, {
      "Set-Cookie": "blog_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    });
    return;
  }

  if ((pathname === base || pathname === `${base}/`) && request.method === "GET") {
    const stats = loadStats();
    sendHtml(response, renderAdminDashboard({ adminBase: base, siteData, stats }));
    return;
  }

  if (pathname === `${base}/settings` && request.method === "GET") {
    sendHtml(response, renderAdminSettings({ adminBase: base, site: siteData.site }));
    return;
  }

  if (pathname === `${base}/settings` && request.method === "POST") {
    const form = parseForm(await readRequestBody(request));
    Object.assign(siteData.site, {
      ...form,
      adminPath: normalizeAdminPath(form.adminPath || "/dashboard")
    });
    saveSiteData(siteData);
    redirect(response, adminPath(siteData));
    return;
  }

  const pageParams = matchRoute(pathname, `${base}/pages/:pageKey`);
  if (pageParams && request.method === "GET") {
    const page = siteData.pages[pageParams.pageKey];
    if (!page) {
      sendHtml(response, "Page not found", 404);
      return;
    }
    sendHtml(
      response,
      renderAdminPageEditor({ adminBase: base, pageKey: pageParams.pageKey, page })
    );
    return;
  }

  if (pathname === `${base}/pages/save` && request.method === "POST") {
    const form = parseForm(await readRequestBody(request));
    if (!siteData.pages[form.pageKey]) {
      sendHtml(response, "Page not found", 404);
      return;
    }

    siteData.pages[form.pageKey] = {
      title: form.title,
      publishedAt: form.publishedAt,
      updatedAt: form.updatedAt,
      contentHtml: form.contentHtml
    };
    saveSiteData(siteData);
    redirect(response, `${base}/pages/${form.pageKey}`);
    return;
  }

  if (pathname === `${base}/posts/new` && request.method === "GET") {
    sendHtml(response, renderAdminPostEditor({ adminBase: base, post: {}, isNew: true }));
    return;
  }

  const postParams = matchRoute(pathname, `${base}/posts/:slug`);
  if (postParams && request.method === "GET") {
    const post = siteData.posts.find((entry) => entry.slug === postParams.slug);
    if (!post) {
      sendHtml(response, "Post not found", 404);
      return;
    }

    sendHtml(response, renderAdminPostEditor({ adminBase: base, post, isNew: false }));
    return;
  }

  if (pathname === `${base}/posts/save` && request.method === "POST") {
    const form = parseForm(await readRequestBody(request));
    const slug = form.slug || form.originalSlug || randomId(4);
    const now = new Date().toISOString();

    const nextPost = {
      slug,
      title: form.title,
      excerpt: form.excerpt || excerptFromHtml(form.contentHtml),
      contentHtml: form.contentHtml,
      categoryName: form.categoryName,
      categorySlug: form.categorySlug,
      publishedAt: form.publishedAt || now,
      updatedAt: form.updatedAt || now,
      pinned: Boolean(form.pinned),
      order: Number.MAX_SAFE_INTEGER
    };

    const index = siteData.posts.findIndex((entry) => entry.slug === form.originalSlug);
    if (index >= 0) {
      const previous = siteData.posts[index];
      siteData.posts[index] = {
        ...previous,
        ...nextPost,
        order: previous.order ?? Number.MAX_SAFE_INTEGER
      };
    } else {
      siteData.posts.push(nextPost);
    }

    syncCategories(siteData);
    saveSiteData(siteData);
    redirect(response, `${base}/posts/${slug}`);
    return;
  }

  if (pathname === `${base}/posts/delete` && request.method === "POST") {
    const form = parseForm(await readRequestBody(request));
    siteData.posts = siteData.posts.filter((post) => post.slug !== form.slug);
    syncCategories(siteData);
    saveSiteData(siteData);
    redirect(response, base);
    return;
  }

  if (pathname === `${base}/friend-links` && request.method === "GET") {
    sendHtml(response, renderAdminFriendLinks({ adminBase: base, friendLinks: siteData.friendLinks }));
    return;
  }

  if (pathname === `${base}/friend-links/save` && request.method === "POST") {
    const form = parseForm(await readRequestBody(request));
    try {
      const parsed = JSON.parse(form.friendLinksJson || "[]");
      siteData.friendLinks = Array.isArray(parsed) ? parsed : [];
      saveSiteData(siteData);
      redirect(response, `${base}/friend-links`);
      return;
    } catch {
      sendHtml(response, "Invalid JSON", 400);
      return;
    }
  }

  sendHtml(response, "Admin route not found", 404);
}

export async function handleRequest(request, response) {
  const host = request.headers.host || "localhost:4321";
  const url = new URL(request.url || "/", `http://${host}`);
  const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/$/, "") || "/";

  if (serveStatic(pathname, response)) {
    return;
  }

  const siteData = loadSiteData();
  const postsByOrder = [...siteData.posts].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    if ((left.order ?? Number.MAX_SAFE_INTEGER) !== (right.order ?? Number.MAX_SAFE_INTEGER)) {
      return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
    }
    return new Date(right.publishedAt || 0).getTime() - new Date(left.publishedAt || 0).getTime();
  });

  if (pathname === adminPath(siteData) || pathname.startsWith(`${adminPath(siteData)}/`)) {
    await handleAdmin(request, response, url, siteData);
    return;
  }

  const stats = loadStats();

  if (request.method !== "GET") {
    sendHtml(response, "Method not allowed", 405);
    return;
  }

  if (pathname === "/" || /^\/page\/\d+$/.test(pathname)) {
    const currentPage = pathname === "/" ? 1 : Number(pathname.split("/").at(-1));
    const pagination = paginate(postsByOrder, currentPage, 10);
    ensureVisitTracking(request, response, stats, pathname);
    sendHtml(
      response,
      renderHomePage({
        siteData,
        stats: loadStats(),
        pagination,
        currentPath: pathname
      })
    );
    return;
  }

  const postParams = matchRoute(pathname, "/archives/:slug");
  if (postParams) {
    const index = postsByOrder.findIndex((post) => post.slug === postParams.slug);
    if (index === -1) {
      ensureVisitTracking(request, response, stats, pathname);
      sendHtml(response, renderNotFound({ siteData, stats: loadStats(), currentPath: pathname }), 404);
      return;
    }
    ensureVisitTracking(request, response, stats, pathname);
    sendHtml(
      response,
      renderPostPage({
        siteData,
        stats: loadStats(),
        post: postsByOrder[index],
        previousPost: postsByOrder[index + 1] || null,
        nextPost: postsByOrder[index - 1] || null,
        currentPath: pathname
      })
    );
    return;
  }

  const categoryParams = matchRoute(pathname, "/categories/:slug");
  if (categoryParams) {
    const category = siteData.categories.find((entry) => entry.slug === categoryParams.slug);
    if (!category) {
      ensureVisitTracking(request, response, stats, pathname);
      sendHtml(response, renderNotFound({ siteData, stats: loadStats(), currentPath: pathname }), 404);
      return;
    }
    const filteredPosts = postsByOrder.filter((post) => post.categorySlug === category.slug);
    ensureVisitTracking(request, response, stats, pathname);
    sendHtml(
      response,
      renderCategoryPage({
        siteData,
        stats: loadStats(),
        category,
        posts: filteredPosts,
        currentPath: pathname
      })
    );
    return;
  }

  if (pathname === "/about") {
    ensureVisitTracking(request, response, stats, pathname);
    sendHtml(
      response,
      renderStaticPage({
        siteData,
        stats: loadStats(),
        page: siteData.pages.about,
        currentPath: pathname,
        activeKey: "about"
      })
    );
    return;
  }

  if (pathname === "/you-lian") {
    ensureVisitTracking(request, response, stats, pathname);
    sendHtml(
      response,
      renderLinksPage({
        siteData,
        stats: loadStats(),
        currentPath: pathname
      })
    );
    return;
  }

  if (pathname === "/search") {
    const query = (url.searchParams.get("q") || "").trim();
    const needle = query.toLowerCase();
    const results = query
      ? postsByOrder.filter((post) =>
          [
            post.title,
            post.excerpt,
            post.contentHtml,
            post.categoryName,
            post.categorySlug
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        )
      : [];
    ensureVisitTracking(request, response, stats, pathname + url.search);
    sendHtml(
      response,
      renderSearchPage({
        siteData,
        stats: loadStats(),
        query,
        results,
        currentPath: pathname + (url.search || "")
      })
    );
    return;
  }

  ensureVisitTracking(request, response, stats, pathname);
  sendHtml(response, renderNotFound({ siteData, stats: loadStats(), currentPath: pathname }), 404);
}
