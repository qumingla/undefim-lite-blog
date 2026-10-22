import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import {parseDocument as parseYamlDocument} from 'yaml';
import sanitizeHtml from 'sanitize-html';
import { codeToHtml } from 'shiki';
import {defaultLicense} from './license.mjs';

export function safeHtml(html) {
 return sanitizeHtml(html, {
  allowedTags: [...sanitizeHtml.defaults.allowedTags,'img','figure','figcaption','details','summary','input','iframe','s','del','span','div','section','video','audio','source','button','math','semantics','annotation','mrow','mi','mn','mo','msup','msub','msubsup','mfrac','msqrt','mroot','mtext','mspace','mover','munder','munderover','mtable','mtr','mtd','mstyle','mpadded','mphantom','menclose'],
  allowedAttributes: { '*':['class','id','aria-hidden','aria-label'], a:['href','title','rel','target'], img:['src','alt','title','width','height','loading'], iframe:['src','width','height','title','sandbox','loading','referrerpolicy'], input:['type','checked','disabled'], code:['class'], span:['class','style'], pre:['class','style','tabindex'], div:['class','style'], video:['src','controls','poster'], audio:['src','controls'], source:['src','type'], button:['type','class','data-copy'], annotation:['encoding'], math:['xmlns','display'], mi:['mathvariant'], mn:['mathvariant'], mtext:['mathvariant'], mo:['fence','stretchy','symmetric','separator','lspace','rspace','minsize','maxsize','movablelimits'], mstyle:['mathvariant','mathcolor','mathsize','scriptlevel','displaystyle'], mspace:['width','height','depth'], mpadded:['width','height','depth','lspace','voffset'], menclose:['notation'], mfrac:['linethickness'], mover:['accent'], munder:['accentunder'], munderover:['accent','accentunder'], mtable:['rowspacing','columnalign','columnspacing','rowlines','columnlines'], mtd:['columnalign','rowspan','columnspan'] },
  allowedStyles: { '*': {color:[/^#[0-9a-f]{3,8}$/i], 'background-color':[/^#[0-9a-f]{3,8}$/i], 'font-style':[/^(normal|italic)$/], 'font-weight':[/^(normal|bold|[1-9]00)$/], 'text-decoration':[/^(none|underline)$/]} },
  allowedSchemes: ['http','https','mailto','tencent'], allowedSchemesByTag:{img:['http','https']}, allowProtocolRelative:false,
  transformTags: { iframe:(tag,attribs)=>({tagName:tag,attribs:{...attribs,sandbox:'allow-scripts allow-forms allow-popups',loading:'lazy',referrerpolicy:'no-referrer'}}), a:(tag,attribs)=>({tagName:tag,attribs:{...attribs,rel:'noopener noreferrer'}}), img:(tag,attribs)=>({tagName:tag,attribs:{...attribs,loading:'lazy'}}), input:(tag,attribs)=>({tagName:'input',attribs:{type:'checkbox',disabled:'disabled',...('checked' in attribs?{checked:'checked'}:{})}}) }
 });
}
export async function renderMarkdown(source) {
 // MathML survives sanitization without allowing KaTeX's positional CSS or SVG.
 const mathEngine={renderToString:(tex,options)=>{const html=katex.renderToString(tex,options);return options.displayMode?`<span class="katex-display">${html}</span>`:html}};
 const md = new MarkdownIt({html:true, linkify:true, typographer:false}).use(anchor,{slugify:s=>s.trim().toLowerCase().replace(/\s+/g,'-')}).use(footnote).use(taskLists,{enabled:false}).use(texmath,{engine:mathEngine,delimiters:'dollars',katexOptions:{throwOnError:false,trust:false,output:'mathml'}});
 const tokens = md.parse(source, {});
 for (const token of tokens) if(token.type === 'fence') {
  const lang = token.info.trim().split(/\s/)[0] || 'text';
  let code;
  try { code = await codeToHtml(token.content,{lang,theme:'github-dark'}); }
  catch { code = await codeToHtml(token.content,{lang:'text',theme:'github-dark'}); }
  token.type='html_block';
  token.content=`<div class="code-block"><div class="code-toolbar"><span>${md.utils.escapeHtml(lang)}</span><button type="button" data-copy="true">复制</button></div>${code}</div>`;
 }
 return safeHtml(md.renderer.render(tokens,md.options,{}));
}
export function importMarkdown(source, filename='untitled.md') {
 const { data:meta, content } = parseFrontMatter(source);
 const title=String(meta.title || content.match(/^#\s+(.+)$/m)?.[1] || filename.replace(/\.md$/i,'')).trim();
 const slug=String(meta.slug || filename.replace(/\.md$/i,'')).normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-|-$/g,'') || 'article';
 const values=v=>Array.isArray(v)?v.map(String):(v?[String(v)]:[]);
 const date=meta.date ? new Date(meta.date) : new Date();
 if(Number.isNaN(date.getTime())) throw new Error('文章日期无效');
 return {copyrightEnabled:meta.copyrightEnabled??defaultLicense.copyrightEnabled,licenseName:meta.licenseName??defaultLicense.licenseName,licenseUrl:meta.licenseUrl??defaultLicense.licenseUrl,licenseNote:meta.licenseNote??defaultLicense.licenseNote,kind:'post',title,markdown:content,format:'markdown',path:String(meta.permalink || `/archives/${slug}`),slug,date:date.toISOString(),modifiedAt:new Date().toISOString(),categories:values(meta.categories || meta.category),tags:values(meta.tags),excerpt:String(meta.description || meta.excerpt || ''),cover:String(meta.cover || ''),pinned:Boolean(meta.pinned),allowComment:meta.comments!==false,author:String(meta.author || 'undefim')};
}
// Only data formats are accepted: uploaded metadata must never execute code.
function parseFrontMatter(source) {
 const text=source.replace(/^\uFEFF/,'');
 const opening=/^---(?!-)([^\r\n]*)\r?\n/.exec(text);
 if(!opening)return {data:{},content:text};
 const language=opening[1].trim().toLowerCase();
 if(!['','yaml','yml','json'].includes(language))throw new Error('Front Matter 仅支持 YAML 或 JSON');
 const rest=text.slice(opening[0].length);
 const closing=/^---[ \t]*(?:\r?\n|$)/m.exec(rest);
 if(!closing)throw new Error('Front Matter 缺少结束分隔符');
 const raw=rest.slice(0,closing.index);
 // YAML 1.1 retains historical date, boolean and merge-key interpretation.
 let data;
 if(language==='json')data=JSON.parse(raw);
 else {
  const doc=parseYamlDocument(raw,{version:'1.1',merge:true});
  if(doc.errors.length||doc.warnings.length)throw new Error('Front Matter YAML 无效或含不支持的标签');
  data=doc.toJS({maxAliasCount:100});
 }
 data??={};
 if(typeof data!=='object'||Array.isArray(data))throw new Error('Front Matter 必须是字段对象');
 return {data,content:rest.slice(closing.index+closing[0].length)};
}
export function excerptOf(d) {
 if(d.excerpt) return d.excerpt;
 return sanitizeHtml(d.html || d.markdown || '',{allowedTags:[],allowedAttributes:{}}).replace(/[#*`>]/g,'').replace(/\s+/g,' ').trim().slice(0,180);
}
