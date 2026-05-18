import { randomBytes } from "node:crypto";

export const SITE_TIMEZONE = "Asia/Shanghai";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function stripHtml(value = "") {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptFromHtml(value = "", maxLength = 180) {
  const text = stripHtml(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

export function parseCookies(header = "") {
  const cookies = {};

  for (const chunk of header.split(";")) {
    const [name, ...rest] = chunk.trim().split("=");
    if (!name) {
      continue;
    }
    cookies[name] = decodeURIComponent(rest.join("=") || "");
  }

  return cookies;
}

export function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function parseForm(body = "") {
  const data = {};
  const params = new URLSearchParams(body);

  for (const [key, value] of params.entries()) {
    data[key] = value;
  }

  return data;
}

export function sendHtml(response, html, statusCode = 200, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(html);
}

export function sendJson(response, payload, statusCode = 200, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

export function redirect(response, location, statusCode = 302, headers = {}) {
  response.writeHead(statusCode, {
    Location: location,
    ...headers
  });
  response.end();
}

export function formatDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SITE_TIMEZONE
  }).format(date).replace(",", "");
}

export function formatShortDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: SITE_TIMEZONE
  }).format(date);
}

export function ensureLeadingSlash(value = "") {
  if (!value) {
    return "/";
  }

  return value.startsWith("/") ? value : `/${value}`;
}

export function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || randomId();
}

export function randomId(size = 16) {
  return randomBytes(size).toString("hex");
}

export function sortPosts(posts = []) {
  return [...posts].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }

    if ((left.order ?? Number.MAX_SAFE_INTEGER) !== (right.order ?? Number.MAX_SAFE_INTEGER)) {
      return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
    }

    return new Date(right.publishedAt || 0).getTime() - new Date(left.publishedAt || 0).getTime();
  });
}

export function paginate(items = [], page = 1, pageSize = 10) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    currentPage,
    totalPages,
    items: items.slice(start, start + pageSize)
  };
}

export function fullUrl(baseUrl, path = "/") {
  return new URL(path, baseUrl).toString();
}

export function normalizeAdminPath(pathname = "") {
  const value = ensureLeadingSlash(pathname);
  return value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
}
