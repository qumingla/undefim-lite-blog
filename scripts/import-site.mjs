import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = process.env.SOURCE_URL || "https://undefi.me";
const rootDir = fileURLToPath(new URL("../", import.meta.url));
const storageFile = join(rootDir, "storage", "site.json");
const publicDir = join(rootDir, "public");
const sourceOrigin = new URL(SOURCE).origin;

const assetExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".pdf",
  ".zip",
  ".txt"
]);

const mirroredAssets = new Map();

function decodeEntities(value = "") {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripTags(value = "") {
  return decodeEntities(
    String(value)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function matchOne(regex, text, fallback = "") {
  const match = text.match(regex);
  return match ? decodeEntities(match[1].trim()) : fallback;
}

function isAssetPath(url) {
  const pathname = new URL(url, SOURCE).pathname.toLowerCase();
  return [...assetExtensions].some((extension) => pathname.endsWith(extension)) || pathname.startsWith("/upload/");
}

function absoluteUrl(value) {
  return new URL(value, SOURCE).toString();
}

function cleanPathname(value) {
  const url = new URL(value, SOURCE);
  return `${url.pathname}${url.search}${url.hash}`;
}

function sanitizeFileSegment(segment) {
  return segment
    .replace(/[^a-zA-Z0-9._%-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "asset";
}

async function fetchText(pathname) {
  const response = await fetch(absoluteUrl(pathname), {
    headers: {
      "user-agent": "undefi-lite-importer/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${pathname}: ${response.status}`);
  }

  return response.text();
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "undefi-lite-importer/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function extractBetween(text, startToken, endToken) {
  const start = text.indexOf(startToken);
  if (start === -1) {
    return "";
  }
  const from = start + startToken.length;
  const end = text.indexOf(endToken, from);
  if (end === -1) {
    return "";
  }
  return text.slice(from, end);
}

function extractDivInnerHtmlByMarker(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) {
    return "";
  }

  const openStart = html.lastIndexOf("<div", start);
  const openEnd = html.indexOf(">", openStart);

  let depth = 1;
  let cursor = openEnd + 1;

  while (depth > 0 && cursor < html.length) {
    const nextOpen = html.indexOf("<div", cursor);
    const nextClose = html.indexOf("</div>", cursor);

    if (nextClose === -1) {
      break;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = html.indexOf(">", nextOpen) + 1;
      continue;
    }

    depth -= 1;
    cursor = nextClose + 6;
  }

  return html.slice(openEnd + 1, cursor - 6);
}

function parseNextPath(html) {
  const match = html.match(/<a href="([^"]+)"\s+class="([^"]*pagination-next[^"]*)">下一页<\/a>/);
  if (!match) {
    return null;
  }

  return match[2].includes("is-invisible") ? null : cleanPathname(match[1]);
}

function parseListCards(html) {
  const mainHtml = extractBetween(
    html,
    '<div class="column column-main">',
    '<aside class="column column-side column-left'
  );

  return mainHtml
    .split(/<div\s+class="card widget">/g)
    .slice(1)
    .map((segment) => {
      if (!segment.includes('<h2 class="title">')) {
        return null;
      }

      const titleBlock = extractBetween(segment, '<h2 class="title">', "</h2>");
      const href = matchOne(/href="([^"]+)"/, titleBlock);
      if (!href.startsWith("/archives/")) {
        return null;
      }

      const title = stripTags(titleBlock.replace(/<span class="top">置顶<\/span>/, ""));
      const excerptHtml = extractBetween(segment, '<div class="main-content">', "</div>");
      const categoryMatch = segment.match(/<div class="level-item">\s*<a href="\/categories\/([^"]+)">([^<]+)<\/a>/);
      const slug = cleanPathname(href).replace(/^\/archives\//, "");

      return {
        slug,
        title,
        publishedAt: matchOne(/<li>(\d{4}-\d{2}-\d{2}[^<]*)<\/li>/, segment),
        excerpt: stripTags(excerptHtml),
        pinned: segment.includes('<span class="top">置顶</span>'),
        categorySlug: categoryMatch ? decodeEntities(categoryMatch[1]) : "",
        categoryName: categoryMatch ? decodeEntities(categoryMatch[2]) : ""
      };
    })
    .filter(Boolean);
}

async function collectHomeSummaries() {
  const summaries = [];
  const seen = new Set();
  let nextPath = "/";

  while (nextPath) {
    const html = await fetchText(nextPath);
    const cards = parseListCards(html);
    for (const card of cards) {
      if (seen.has(card.slug)) {
        continue;
      }
      seen.add(card.slug);
      summaries.push({
        ...card,
        order: summaries.length
      });
    }
    nextPath = parseNextPath(html);
  }

  return summaries;
}

function parseCategoryName(pageHtml) {
  return matchOne(
    /<div class="card card-content main-title">[\s\S]*?<li>([^<]+)<\/li>\s*<\/ul>/,
    pageHtml,
    "未分类"
  );
}

async function collectCategoryMappings(categoryPaths) {
  const mapping = new Map();
  const categories = new Map();

  for (const path of categoryPaths) {
    let nextPath = path;
    let categoryName = "";

    while (nextPath) {
      const html = await fetchText(nextPath);
      if (!categoryName) {
        categoryName = parseCategoryName(html);
        categories.set(path.replace(/^\/categories\//, ""), {
          slug: path.replace(/^\/categories\//, ""),
          name: categoryName
        });
      }

      for (const card of parseListCards(html)) {
        mapping.set(card.slug, {
          slug: path.replace(/^\/categories\//, ""),
          name: categoryName
        });
      }

      nextPath = parseNextPath(html);
    }
  }

  return {
    mapping,
    categories: [...categories.values()]
  };
}

async function mirrorAsset(rawUrl) {
  if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("/mirror/")) {
    return rawUrl;
  }

  const absolute = absoluteUrl(rawUrl);
  if (mirroredAssets.has(absolute)) {
    return mirroredAssets.get(absolute);
  }

  const url = new URL(absolute);
  const localPath = [
    "/mirror",
    sanitizeFileSegment(url.host),
    ...url.pathname.split("/").filter(Boolean).map(sanitizeFileSegment)
  ].join("/");
  const filePath = join(rootDir, "public", ...localPath.split("/").filter(Boolean));

  mkdirSync(dirname(filePath), { recursive: true });
  try {
    const buffer = await fetchBuffer(absolute);
    writeFileSync(filePath, buffer);
    mirroredAssets.set(absolute, localPath);
    return localPath;
  } catch (error) {
    const scope = absolute.startsWith(sourceOrigin) || absolute.includes("oss.qumingla.online") ? "site" : "external";
    console.warn(`Skipping ${scope} asset mirror: ${absolute}`);
    mirroredAssets.set(absolute, absolute);
    return absolute;
  }
}

async function replaceAsync(text, regex, asyncReplacer) {
  const matches = [...text.matchAll(regex)];
  if (matches.length === 0) {
    return text;
  }

  let result = "";
  let lastIndex = 0;
  for (const match of matches) {
    result += text.slice(lastIndex, match.index);
    result += await asyncReplacer(...match);
    lastIndex = match.index + match[0].length;
  }
  result += text.slice(lastIndex);
  return result;
}

async function rewriteContentHtml(html) {
  let rewritten = html.replace(/\s(?:srcset|sizes)="[^"]*"/g, "");

  rewritten = await replaceAsync(
    rewritten,
    /(src|poster|href)="([^"]+)"/g,
    async (full, attribute, rawUrl) => {
      if (!rawUrl || rawUrl.startsWith("#") || rawUrl.startsWith("mailto:") || rawUrl.startsWith("javascript:")) {
        return full;
      }

      const absolute = absoluteUrl(rawUrl);

      if (attribute === "href" && !isAssetPath(absolute)) {
        if (absolute.startsWith(sourceOrigin)) {
          return `${attribute}="${cleanPathname(absolute)}"`;
        }
        return full;
      }

      if (!isAssetPath(absolute) && attribute !== "src" && attribute !== "poster") {
        return full;
      }

      const mirrored = await mirrorAsset(absolute);
      return `${attribute}="${mirrored}"`;
    }
  );

  rewritten = await replaceAsync(rewritten, /url\(["']?([^"')]+)["']?\)/g, async (full, rawUrl) => {
    if (!rawUrl || rawUrl.startsWith("data:")) {
      return full;
    }
    if (!isAssetPath(rawUrl)) {
      return full;
    }
    const mirrored = await mirrorAsset(rawUrl);
    return `url("${mirrored}")`;
  });

  return rewritten;
}

async function parsePostPage(path) {
  const html = await fetchText(path);
  const title = matchOne(/<h1 class="title">([^<]+)<\/h1>/, html);
  const contentHtml = extractDivInnerHtmlByMarker(html, 'class="main-content article"');
  const updatedAt = matchOne(/<h6>更新于<\/h6>\s*<p>([^<]+)<\/p>/, html);

  return {
    title,
    publishedAt: matchOne(/<ul class="breadcrumb">\s*<li>([^<]+)<\/li>/, html),
    updatedAt,
    contentHtml: await rewriteContentHtml(contentHtml)
  };
}

async function parseSinglePage(path, fallbackTitle) {
  const html = await fetchText(path);
  const title = matchOne(/<h1 class="title">([^<]+)<\/h1>/, html, fallbackTitle);
  const contentHtml = extractDivInnerHtmlByMarker(html, 'class="main-content article"');
  const updatedAt = matchOne(/<h6>更新于<\/h6>\s*<p>([^<]+)<\/p>/, html);

  return {
    title,
    publishedAt: matchOne(/<ul class="breadcrumb">\s*<li>([^<]+)<\/li>/, html),
    updatedAt,
    contentHtml: await rewriteContentHtml(contentHtml),
    rawHtml: html
  };
}

function parseFriendLinks(contentHtml) {
  const links = [];
  const rowRegex = /<tr><td><img src="([^"]+)"[^>]*><\/td><td><a href="([^"]+)">([^<]+)<\/a><\/td><td><a href="[^"]+">([^<]+)<\/a><\/td><\/tr>/g;

  for (const match of contentHtml.matchAll(rowRegex)) {
    links.push({
      avatar: match[1],
      url: match[2],
      name: decodeEntities(match[3]),
      label: decodeEntities(match[4])
    });
  }

  return links;
}

async function localizeSiteAssets(siteData) {
  siteData.site.logo = await mirrorAsset(siteData.site.logo);
  siteData.site.avatar = await mirrorAsset(siteData.site.avatar);
  siteData.site.backgroundImage = await mirrorAsset(siteData.site.backgroundImage);
  await mirrorAsset(`${SOURCE}/themes/theme-dream/assets/font/WenCang.woff2`);

  for (const link of siteData.friendLinks) {
    if (link.avatar) {
      link.avatar = await mirrorAsset(link.avatar);
    }
  }
}

function formatImportedDate(value) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T00:00:00+08:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(normalized)) {
    return `${normalized.replace(" ", "T")}:00+08:00`;
  }
  return normalized;
}

async function main() {
  mkdirSync(publicDir, { recursive: true });

  const sitemapXml = await fetchText("/sitemap.xml");
  const archivePaths = [...sitemapXml.matchAll(/<loc>(https:\/\/undefi\.me\/archives\/[^<]+)<\/loc>/g)].map((match) =>
    cleanPathname(match[1])
  );
  const categoryPaths = [...sitemapXml.matchAll(/<loc>(https:\/\/undefi\.me\/categories\/[^<]+)<\/loc>/g)]
    .map((match) => cleanPathname(match[1]))
    .filter((path) => path !== "/categories");

  const homeHtml = await fetchText("/");
  const summaries = await collectHomeSummaries();
  const { mapping: categoryMapping, categories } = await collectCategoryMappings(categoryPaths);
  const aboutPage = await parseSinglePage("/about", "关于");
  const linksPage = await parseSinglePage("/you-lian", "友链");
  const noticeSection = extractBetween(homeHtml, '<div class="card widget notice', "</aside>");
  const noticeBodyHtml = matchOne(/<div class="card-content">\s*<div>([\s\S]*?)<\/div>\s*<\/div>/, noticeSection);

  const siteData = {
    site: {
      title: matchOne(/<meta property="og:title" content="([^"]+)">/, homeHtml, "undefim'blog"),
      tagline: "技术随笔与实践记录",
      description: matchOne(/<meta name="description" content="([^"]+)"/, homeHtml),
      url: SOURCE,
      themeColor: matchOne(/html\s*\{\s*--theme:\s*([^;]+);/m, homeHtml, "#00c7fc"),
      backgroundImage: matchOne(/body:before\s*\{\s*background:\s*url\("([^"]+)"/, homeHtml),
      logo: absoluteUrl(matchOne(/<img class="logo-img" src="([^"]+)"/, homeHtml)),
      avatar: absoluteUrl(matchOne(/<img class="avatar" src="([^"]+)"/, homeHtml)),
      foundedAt: "2023-04-01T00:00:00+08:00",
      authorName: matchOne(/<p class="nickname">([^<]+)<\/p>/, homeHtml, "undefim"),
      authorMotto: matchOne(/<p class="motto[^"]*">([^<]+)<\/p>/, homeHtml),
      authorLocation: matchOne(/<p class="address">[\s\S]*?<span>([^<]+)<\/span>/, homeHtml),
      authorEmail: "undefim@linux.do",
      backupEmail: "undefim@gmail.com",
      qq: "3068768267",
      github: "https://github.com/qumingla",
      noticeTitle: "欢迎来访我的个人博客。",
      noticeBodyHtml: await rewriteContentHtml(noticeBodyHtml),
      adminPath: "/dashboard"
    },
    pages: {
      about: {
        title: aboutPage.title,
        publishedAt: formatImportedDate(aboutPage.publishedAt),
        updatedAt: formatImportedDate(aboutPage.updatedAt),
        contentHtml: aboutPage.contentHtml
      },
      links: {
        title: linksPage.title,
        publishedAt: formatImportedDate(linksPage.publishedAt),
        updatedAt: formatImportedDate(linksPage.updatedAt),
        contentHtml: linksPage.contentHtml
      }
    },
    friendLinks: parseFriendLinks(linksPage.contentHtml),
    categories,
    posts: []
  };

  for (const summary of summaries) {
    const details = await parsePostPage(`/archives/${summary.slug}`);
    const category = categoryMapping.get(summary.slug);

    siteData.posts.push({
      slug: summary.slug,
      title: details.title || summary.title,
      excerpt: summary.excerpt,
      contentHtml: details.contentHtml,
      categorySlug: summary.categorySlug || category?.slug || "",
      categoryName: summary.categoryName || category?.name || "",
      publishedAt: formatImportedDate(details.publishedAt || summary.publishedAt),
      updatedAt: formatImportedDate(details.updatedAt),
      pinned: summary.pinned,
      order: summary.order
    });
  }

  const importedSlugs = new Set(siteData.posts.map((post) => post.slug));
  for (const archivePath of archivePaths) {
    const slug = archivePath.replace(/^\/archives\//, "");
    if (importedSlugs.has(slug)) {
      continue;
    }

    const details = await parsePostPage(archivePath);
    const category = categoryMapping.get(slug);
    siteData.posts.push({
      slug,
      title: details.title,
      excerpt: stripTags(details.contentHtml).slice(0, 180),
      contentHtml: details.contentHtml,
      categorySlug: category?.slug || "",
      categoryName: category?.name || "",
      publishedAt: formatImportedDate(details.publishedAt),
      updatedAt: formatImportedDate(details.updatedAt),
      pinned: false,
      order: Number.MAX_SAFE_INTEGER
    });
  }

  await localizeSiteAssets(siteData);

  writeFileSync(storageFile, JSON.stringify(siteData, null, 2));

  console.log(`Imported ${siteData.posts.length} posts, ${siteData.categories.length} categories and ${siteData.friendLinks.length} friend links.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
