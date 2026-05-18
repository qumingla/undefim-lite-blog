import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const storageFile = join(rootDir, "storage", "site.json");

function fail(message) {
  console.error(`Validation failed: ${message}`);
  process.exit(1);
}

function ensureString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${label} must be a non-empty string`);
  }
}

function ensureArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
}

function main() {
  const raw = readFileSync(storageFile, "utf8");
  const data = JSON.parse(raw);

  if (!data || typeof data !== "object") {
    fail("site.json must contain an object");
  }

  if (!data.site || typeof data.site !== "object") {
    fail("site section is missing");
  }

  ensureString(data.site.title, "site.title");
  ensureString(data.site.description, "site.description");
  ensureString(data.site.authorName, "site.authorName");
  ensureString(data.site.adminPath, "site.adminPath");

  if (!data.pages || typeof data.pages !== "object") {
    fail("pages section is missing");
  }

  if (!data.pages.about || !data.pages.links) {
    fail("about or links page definition is missing");
  }

  ensureString(data.pages.about.title, "pages.about.title");
  ensureString(data.pages.links.title, "pages.links.title");

  ensureArray(data.posts, "posts");
  ensureArray(data.categories, "categories");
  ensureArray(data.friendLinks, "friendLinks");

  for (const [index, post] of data.posts.entries()) {
    if (!post || typeof post !== "object") {
      fail(`posts[${index}] must be an object`);
    }

    ensureString(post.slug, `posts[${index}].slug`);
    ensureString(post.title, `posts[${index}].title`);

    if (typeof post.contentHtml !== "string") {
      fail(`posts[${index}].contentHtml must be a string`);
    }
  }

  console.log(
    `Validated site.json: ${data.posts.length} posts, ${data.categories.length} categories, ${data.friendLinks.length} friend links.`
  );
}

main();
