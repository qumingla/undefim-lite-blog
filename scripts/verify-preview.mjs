import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:4324';
const production = base.startsWith('https://');
const access = await fs.readFile('data/admin-access.txt', 'utf8');
const username = access.match(/用户名：([^\n]+)/)?.[1];
const password = access.match(/初始密码：([^\n]+)/)?.[1];
if (!username || !password) throw new Error('初始凭据文件格式无效');
let cookie = '', csrf = '';
const request = async (route, options = {}) => {
 const response = await fetch(base + route, {
  ...options,
  headers: {cookie, 'X-CSRF-Token': csrf, ...(['POST','PUT','PATCH','DELETE'].includes(options.method) ? {Origin:new URL(base).origin} : {}), ...(options.body ? {'Content-Type':'application/json'} : {}), ...options.headers},
  body: options.body ? JSON.stringify(options.body) : undefined,
  signal: AbortSignal.timeout(15000)
 });
 return response;
};
assert.equal((await request('/api/health')).status, 200);
assert.equal((await request('/api/documents')).status, 401);
const login = await request('/api/auth/login', {method:'POST', body:{username,password}});
assert.equal(login.status, 200, '管理员登录失败');
if(production) {
 assert.match(login.headers.get('set-cookie'), /; Secure(?:;|$)/i);
 assert.match(login.headers.get('set-cookie'), /; HttpOnly(?:;|$)/i);
 assert.match(login.headers.get('set-cookie'), /; SameSite=Strict(?:;|$)/i);
}
cookie = login.headers.get('set-cookie').split(';')[0];
csrf = (await login.json()).csrf;
try {
 const documents = await (await request('/api/documents')).json();
 const deleted = await (await request('/api/documents?deleted=true')).json();
 const media = await (await request('/api/media')).json();
 const comments = await (await request('/api/comments')).json();
 const settings = await (await request('/api/settings')).json();
 const jobs = await (await request('/api/jobs')).json();
 const all = [...documents,...deleted];
 const counts = {
  posts: all.filter(d=>d.kind==='post').length,
  pages: all.filter(d=>d.kind==='page').length,
  publicPosts: documents.filter(d=>d.kind==='post' && d.visibility==='public' && d.published).length,
  privatePosts: documents.filter(d=>d.kind==='post' && d.visibility==='private').length,
  deletedPosts: deleted.filter(d=>d.kind==='post').length,
  media: media.length, comments:comments.length, categories:settings.categories.length, tags:settings.tags.length
 };
 assert.deepEqual(counts,{posts:45,pages:3,publicPosts:26,privatePosts:4,deletedPosts:15,media:27,comments:5,categories:4,tags:9});
 let revisions = 0;
 for(const d of all) {
  revisions += (await (await request(`/api/documents/${d.id}/revisions`)).json()).length;
  if(d.visibility==='private' || d.deletedAt) {
   assert.equal((await request(d.path)).status,404, '非公开内容路径可访问');
   assert.equal((await request(`/api/public/documents/${d.id}/comments`)).status,404, '非公开内容评论可访问');
  }
 }
 assert.equal(revisions,154);
 const search = await (await request('/search-index.json')).json();
 assert.equal(search.length,26);
 const headers = {};
 for(const route of ['/','/admin/','/api/documents',media[0].path]) {
  const response=await request(route);
  assert.equal(response.status,200);
  headers[route]=response.headers.get('cache-control');
 }
 assert.equal(headers['/admin/'],'no-store');
 assert.equal(headers['/api/documents'],'no-store');
 assert.match(headers['/'],/s-maxage=300/);
 assert.match(headers[media[0].path],/immutable/);
 const preview = await request('/api/preview',{method:'POST',body:{format:'markdown',source:'# 检查\n\n| A | B |\n|---|---|\n|1|2|\n\n```js\nconst a=1;\n```'}});
 const {html}=await preview.json();
 assert.match(html,/<table>/); assert.match(html,/data-copy/);
 const report={checkedAt:new Date().toISOString(),destination:base,health:'ok',counts,revisions,publicSearchDocuments:search.length,privacy:'passed',markdownPreview:'passed',...(production?{secureCookies:'passed',browserOrigin:'passed'}:{}),headers,latestJob:jobs[0]?{status:jobs[0].status,createdAt:jobs[0].created_at}:null};
 await fs.writeFile(`migration/reports/${production?'production-service':'oracle-service'}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
} finally { await request('/api/auth/logout',{method:'POST'}); }
