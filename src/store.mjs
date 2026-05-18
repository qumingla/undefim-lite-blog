import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const storageDir = join(rootDir, "storage");
const siteFile = join(storageDir, "site.json");
const statsFile = join(storageDir, "stats.json");

const defaultSiteData = {
  site: {
    title: "undefim'blog",
    tagline: "技术随笔与实践记录",
    description: "分享网络技术、服务器部署、内网穿透等技术教程与实践经验的个人博客。",
    url: "http://localhost:4321",
    themeColor: "#00c7fc",
    backgroundImage: "",
    logo: "",
    avatar: "",
    foundedAt: "2023-04-01T00:00:00+08:00",
    authorName: "undefim",
    authorMotto: "Crafting my own path, forever undefined!",
    authorLocation: "中国-浙江",
    authorEmail: "undefim@linux.do",
    backupEmail: "undefim@gmail.com",
    qq: "3068768267",
    github: "https://github.com/qumingla",
    noticeTitle: "欢迎来访我的个人博客。",
    noticeBodyHtml: "<p>Welcome to visit my personal blog.</p>",
    adminPath: "/dashboard"
  },
  pages: {
    about: {
      title: "关于",
      publishedAt: "",
      updatedAt: "",
      contentHtml: "<p>这里是关于页。</p>"
    },
    links: {
      title: "友链",
      publishedAt: "",
      updatedAt: "",
      contentHtml: "<p>这里是友链页。</p>"
    }
  },
  friendLinks: [],
  categories: [],
  posts: []
};

const defaultStats = {
  sitePv: 0,
  siteUv: 0,
  pageViews: {},
  recentVisitors: {}
};

function readJson(path, fallback) {
  if (!existsSync(path)) {
    return structuredClone(fallback);
  }

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function ensureStorageFiles() {
  mkdirSync(storageDir, { recursive: true });

  if (!existsSync(siteFile)) {
    writeJson(siteFile, defaultSiteData);
  }

  if (!existsSync(statsFile)) {
    writeJson(statsFile, defaultStats);
  }
}

export function getStorageDir() {
  return storageDir;
}

export function getRootDir() {
  return rootDir;
}

export function loadSiteData() {
  return readJson(siteFile, defaultSiteData);
}

export function saveSiteData(value) {
  writeJson(siteFile, value);
}

export function loadStats() {
  return readJson(statsFile, defaultStats);
}

export function saveStats(value) {
  writeJson(statsFile, value);
}
