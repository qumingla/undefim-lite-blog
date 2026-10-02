import fs from 'node:fs';
import {publicExport} from '../../server/db.mjs';
import {safeHtml,renderMarkdown,excerptOf} from '../../server/markdown.mjs';
export const content=process.env.CONTENT_SNAPSHOT?JSON.parse(fs.readFileSync(process.env.CONTENT_SNAPSHOT,'utf8')):publicExport();
export const config=content.settings;
export const posts=content.documents.filter(d=>d.kind==='post').sort((a,b)=>Number(b.pinned)-Number(a.pinned)||new Date(b.date)-new Date(a.date));
export const dateLabel=d=>new Date(d).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).replaceAll('/','-');
export const summary=d=>excerptOf(d);
export const taxLink=(name,type='categories')=>`/${type}/${config[type].find(x=>x.name===name)?.slug||encodeURIComponent(name)}`;
export async function bodyOf(d) {
 let html=d.format==='markdown'?await renderMarkdown(d.markdown||''):safeHtml(d.markdown||d.html||'');
 if(d.path==='/you-lian'&&config.links.length) {
  const esc=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const table=`<table><thead><tr><th>头像</th><th>网站名称</th><th>网站地址</th></tr></thead><tbody>${config.links.map(l=>`<tr><td>${l.logo?`<img src="${esc(l.logo)}" alt="${esc(l.name)}" width="64" loading="lazy">`:''}</td><td><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)}</a></td><td><a href="${esc(l.url)}" rel="noopener noreferrer">${esc(l.url)}</a></td></tr>`).join('')}</tbody></table>`;
  html=html.includes('<table>')?html.replace(/<table>[\s\S]*?<\/table>/,table):html+table;
 }
 for(const [original,local] of Object.entries(config.assetMap||{})) html=html.replaceAll(original,local);
 let n=0;const toc=[];
 html=html.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi,(_,level,attrs,text)=>{
  const title=text.replace(/<[^>]+>/g,'').trim();const id=attrs.match(/\bid="([^"]+)"/)?.[1]||`section-${++n}`;
  if(title)toc.push({level:Number(level),id,title});
  return `<h${level}${attrs.includes('id=')?attrs:`${attrs} id="${id}"`}>${text}</h${level}>`;
 });
 return {html,toc};
}
