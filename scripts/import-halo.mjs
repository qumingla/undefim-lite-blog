import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { db, dataDir, setSettings, defaultSettings } from '../server/db.mjs';

const source = process.argv[2] || 'migration/source/20261001215527-backup-6abe664f.zip';
if(db.prepare('SELECT COUNT(*) AS n FROM documents').get().n) throw new Error('目标数据库已有内容，导入已停止，避免覆盖');
const bytes = await fs.readFile(source);
const zip = await JSZip.loadAsync(bytes);
const records = JSON.parse(await zip.file('extensions.data').async('string')).map(r=>JSON.parse(Buffer.from(r.data,'base64')));
const of = kind=>records.filter(r=>r.kind===kind);
const snapshots = new Map(of('Snapshot').map(s=>[s.metadata.name,s]));
const memo = new Map();
function reconstruct(id, field, chain=new Set()) {
 const key=`${id}:${field}`; if(memo.has(key)) return memo.get(key);
 const s=snapshots.get(id); if(!s || chain.has(id)) throw new Error(`历史快照缺失或循环：${id}`);
 const raw=s.spec[field] || '';
 let result=raw;
 if(s.spec.parentSnapshotName && s.metadata.annotations?.['content.halo.run/keep-raw']!=='true') {
  // Halo delta snapshots are cumulative against the nearest keep-raw snapshot.
  // parentSnapshotName also retains revision ancestry, not the delta's input text.
  let base=snapshots.get(s.spec.parentSnapshotName);const seen=new Set([id]);
  while(base?.spec.parentSnapshotName && base.metadata.annotations?.['content.halo.run/keep-raw']!=='true') {
   if(seen.has(base.metadata.name))throw new Error('历史快照循环');seen.add(base.metadata.name);
   base=snapshots.get(base.spec.parentSnapshotName);
  }
  const parent=reconstruct(base?.metadata.name,field,new Set([...chain,id]));
  const patches=JSON.parse(raw); if(!Array.isArray(patches)) throw new Error(`历史差量格式无效：${id}`);
  const lines=parent.split('\n');
  for(const p of [...patches].sort((a,b)=>b.source.position-a.source.position)) {
   const {position,lines:old}=p.source;
   if(old.some((s,i)=>lines[position+i]!==s)) throw new Error(`历史差量校验失败：${id} 行 ${position}`);
   lines.splice(position,old.length,...p.target.lines);
  }
  result=lines.join('\n');
 }
 memo.set(key,result);return result;
}
const tax = kind=>of(kind).map(c=>({id:c.metadata.name,name:c.spec.displayName,slug:c.spec.slug,description:c.spec.description||'',color:c.spec.color||'',children:c.spec.children||[],hidden:!!c.spec.hideFromList}));
const categories=tax('Category'),tags=tax('Tag');
const localize = value=>String(value||'').replaceAll('https://undefi.me/upload/','/upload/');
function content(record,snapshotId) {
 const s=record.spec;const snap=snapshots.get(snapshotId);if(!snap)throw new Error(`文章快照缺失：${record.metadata.name}`);
 return {kind:record.kind==='Post'?'post':'page',title:s.title,slug:s.slug,path:record.status?.permalink||`/${record.kind==='Post'?'archives/':''}${s.slug}`,format:snap.spec.rawType.toLowerCase()==='markdown'?'markdown':'html',markdown:localize(reconstruct(snapshotId,'rawPatch')),html:localize(reconstruct(snapshotId,'contentPatch')),date:s.publishTime||record.metadata.creationTimestamp,modifiedAt:record.status?.lastModifyTime||snap.spec.lastModifyTime||record.metadata.creationTimestamp,author:defaultSettings.author,categories:(s.categories||[]).map(id=>categories.find(c=>c.id===id)?.name||id),tags:(s.tags||[]).map(id=>tags.find(t=>t.id===id)?.name||id),excerpt:s.excerpt?.autoGenerate===false?s.excerpt.raw||'':'',cover:localize(s.cover),pinned:!!s.pinned,allowComment:s.allowComment!==false,visibility:s.visible==='PUBLIC'?'public':'private',source:{id:record.metadata.name,snapshot:snapshotId,owner:s.owner,template:s.template||'',originalExcerpt:record.status?.excerpt||'',priority:s.priority||0,htmlMetas:s.htmlMetas||[]}};
}
const all=[...of('Post'),...of('SinglePage')];
db.exec('BEGIN IMMEDIATE');
try {
 for(const r of [...all].sort((a,b)=>(Number(a.spec.deleted)*2+Number(a.spec.visible!=='PUBLIC'))-(Number(b.spec.deleted)*2+Number(b.spec.visible!=='PUBLIC')))) {
  const d=content(r,r.spec.headSnapshot); const live=r.spec.publish&&r.spec.visible==='PUBLIC'&&!r.spec.deleted?content(r,r.spec.releaseSnapshot):null;
  if(db.prepare('SELECT id FROM documents WHERE path=?').get(d.path)) {
   if(!r.spec.deleted&&r.spec.visible==='PUBLIC')throw new Error('公开文章路径重复');
   d.source.originalPath=d.path;d.path=`/archives/recovered-${r.metadata.name}`;
  }
  db.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?,?)').run(r.metadata.name,d.kind,d.path,JSON.stringify(d),live?JSON.stringify(live):null,r.spec.deleted?r.metadata.deletionTimestamp||new Date().toISOString():null,d.modifiedAt);
  const counter=of('Counter').find(c=>c.metadata.name.endsWith(`/${r.metadata.name}`));
  db.prepare('INSERT INTO stats VALUES (?,?,?)').run(r.metadata.name,counter?.visit||0,counter?.upvote||0);
 }
 for(const s of of('Snapshot')) {
  const r=all.find(r=>r.metadata.name===s.spec.subjectRef?.name);if(!r)throw new Error('发现无法归属的历史快照');
  const data={...content(r,s.metadata.name),modifiedAt:s.spec.lastModifyTime||s.metadata.creationTimestamp};
  db.prepare('INSERT INTO revisions VALUES (?,?,?,?,?)').run(s.metadata.name,r.metadata.name,JSON.stringify(data),s.spec.lastModifyTime||s.metadata.creationTimestamp,'halo-import');
 }
 for(const c of of('Comment')) {
  const s=c.spec;const author=s.owner?.displayName||s.owner?.name||'访客';
  db.prepare('INSERT INTO comments VALUES (?,?,?,?,?,?,?,?)').run(c.metadata.name,s.subjectRef.name,null,author,s.owner?.kind==='Email'?s.owner.name:null,s.raw||s.content||'',s.hidden?'hidden':s.approved?'approved':'pending',s.creationTime||c.metadata.creationTimestamp);
  db.prepare('INSERT INTO comment_sources VALUES (?,?)').run(c.metadata.name,JSON.stringify(s));
 }
 setSettings({categories,tags,links:of('Link').map(l=>({name:l.spec.displayName,url:l.spec.url,logo:l.spec.logo||''})),umamiWebsiteId:'395896c6-47c1-4ef2-bbdb-297c27783e8c',originalPostCount:30,originalVisits:of('Counter').reduce((n,c)=>n+(c.visit||0),0)});
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}
const assets=[];
for(const file of Object.values(zip.files).filter(f=>!f.dir&&f.name.startsWith('workdir/attachments/'))) {
 const relative=file.name.slice('workdir/attachments/'.length);
 if(relative.includes('..')||path.isAbsolute(relative))throw new Error('附件路径不安全');
 const data=await file.async('nodebuffer'); const target=path.join(dataDir,'media',relative);
 await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data);
 // Legacy attachments keep their exact URLs; application backup owns the authoritative copy.
 const publicTarget=path.join('public',relative);await fs.mkdir(path.dirname(publicTarget),{recursive:true});await fs.writeFile(publicTarget,data);
 assets.push({path:`/${relative}`,size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
for(const a of of('Attachment')) {
 const relative=a.metadata.annotations?.['storage.halo.run/local-relative-path'];
 const asset=assets.find(x=>x.path===`/${relative}`);if(!asset)throw new Error(`附件文件缺失：${a.spec.displayName}`);
 db.prepare('INSERT INTO media VALUES (?,?,?,?,?,?,?)').run(a.metadata.name,a.spec.displayName,asset.path,a.spec.mediaType,asset.size,asset.sha256,a.metadata.creationTimestamp);
}
const references = new Set();
for(const r of all) {
 const d=content(r,r.spec.headSnapshot);
 for(const m of (d.markdown+'\n'+d.html).matchAll(/(?:src|href)=["']([^"']+)["']|!\[[^\]]*\]\(([^)\s]+)\)/g)) references.add(m[1]||m[2]);
}
const report={createdAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(bytes).digest('hex'),posts:{public:all.filter(r=>r.kind==='Post'&&!r.spec.deleted&&r.spec.publish&&r.spec.visible==='PUBLIC').length,private:all.filter(r=>r.kind==='Post'&&!r.spec.deleted&&r.spec.visible==='PRIVATE').length,deleted:all.filter(r=>r.kind==='Post'&&r.spec.deleted).length},pages:of('SinglePage').length,revisions:of('Snapshot').length,categories:categories.length,tags:tags.length,comments:of('Comment').length,registeredAttachments:of('Attachment').length,files:assets,missingLocalReferences:[...references].filter(u=>u.startsWith('/upload/')&&!assets.some(a=>a.path===decodeURI(u))),externalReferences:[...references].filter(u=>/^https?:/.test(u)).map(u=>{try{return new URL(u).origin}catch{return 'invalid'}}).filter((x,i,a)=>a.indexOf(x)===i)};
await fs.mkdir('migration/reports',{recursive:true});await fs.writeFile('migration/reports/import.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,files:assets.length,externalReferences:report.externalReferences.length},null,2));
