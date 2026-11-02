import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import http from 'node:http';
import {createSystemUpdate,defaultUpdateConfig,validateUpdateConfig,writeUpdateFile,readUpdateFile,publishUpdateRequest} from '../server/system-update.mjs';
import {workerOptions,workerTick,nextUpdateAt,executeUpdate,waitForHealth} from '../scripts/update-worker.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'blog-updater-test-'));
process.env.DATA_DIR=path.join(root,'api-data');process.env.COOKIE_SECURE='false';
const {db,saveDocument,document,publicExport}=await import('../server/db.mjs');
const {passwordHash}=await import('../server/auth.mjs');
const {createApp}=await import('../server/index.mjs');
const fresh=async()=>fs.mkdtemp(path.join(root,'case-'));
const at=Date.now();
const liveState={heartbeatAt:new Date(at).toISOString(),repository:'example/blog',branch:'main',job:null};

test('更新默认手动，严格拒绝任意命令、仓库与无效定时间隔',async()=>{
 const data=await fresh(),service=createSystemUpdate(data,{clock:()=>at});
 assert.deepEqual((await service.status()).config,defaultUpdateConfig);
 for(const bad of [{mode:'auto',intervalHours:0},{mode:'manual',intervalHours:'24'},{mode:'shell',intervalHours:24},{mode:'auto',intervalHours:24,command:'anything'},{mode:'auto',intervalHours:24,repository:'evil/repo'}])assert.throws(()=>validateUpdateConfig(bad));
 await service.configure({mode:'auto',intervalHours:6});
 assert.deepEqual((await createSystemUpdate(data).status()).config,{mode:'auto',intervalHours:6});
 await assert.rejects(()=>service.request(),e=>e.statusCode===503);
 await writeUpdateFile(path.join(data,'system-update/status.json'),liveState);
 const results=await Promise.allSettled(Array.from({length:8},()=>service.request()));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.statusCode===409));
 assert.equal((await service.status()).pending.trigger,'manual');
 assert.equal((await createSystemUpdate(data,{clock:()=>at+46000}).status()).online,false);
});

test('API 更新入口鉴权、CSRF、Origin、参数与维护写屏障保持有效',async()=>{
 const data=await fresh(),systemUpdate=createSystemUpdate(data),app=await createApp({systemUpdate});
 db.prepare('INSERT INTO users VALUES (?,?)').run('update-test',passwordHash('isolated-update-test-password'));
 const base={kind:'post',title:'隔离内容',path:'/archives/update-private',format:'markdown',markdown:'未发布的私密正文',date:'2026-11-02T00:00:00Z',visibility:'private'};
 const privateDoc=saveDocument(base);
 const before=document(privateDoc.id);
 try{
  for(const url of ['/api/system/update','/api/system/update/config','/api/system/update/run'])assert.equal((await app.inject({url,method:url.endsWith('/config')?'PUT':url.endsWith('/run')?'POST':'GET',payload:url.endsWith('/config')?defaultUpdateConfig:undefined})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'update-test',password:'isolated-update-test-password'}});
  const headers={cookie:login.headers['set-cookie'].split(';')[0],'x-csrf-token':login.json().csrf};
  assert.equal((await app.inject({method:'PUT',url:'/api/system/update/config',headers:{cookie:headers.cookie},payload:defaultUpdateConfig})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url:'/api/system/update/config',headers:{...headers,origin:'https://evil.example'},payload:defaultUpdateConfig})).statusCode,403);
  const configured=await app.inject({method:'PUT',url:'/api/system/update/config',headers,payload:{mode:'auto',intervalHours:12}});
  assert.equal(configured.statusCode,200);
  const status=await app.inject({url:'/api/system/update',headers});assert.equal(status.headers['cache-control'],'no-store');assert.equal(status.json().config.mode,'auto');
  assert.doesNotMatch(JSON.stringify(publicExport()),/intervalHours|system-update|未发布的私密正文/);
  await writeUpdateFile(path.join(data,'system-update/status.json'),{...liveState,heartbeatAt:new Date().toISOString()});
  assert.equal((await app.inject({method:'POST',url:'/api/system/update/run',headers,payload:{command:'git reset'}})).statusCode,400);
  const queued=await app.inject({method:'POST',url:'/api/system/update/run',headers});assert.equal(queued.statusCode,202);
  assert.equal((await app.inject({method:'POST',url:'/api/system/update/run',headers})).statusCode,409);
  await writeUpdateFile(path.join(data,'system-update/status.json'),{...liveState,heartbeatAt:new Date().toISOString(),job:{status:'running',maintenance:true}});
  const blocked=await app.inject({method:'PUT',url:`/api/documents/${privateDoc.id}`,headers,payload:{...before,title:'不应保存'}});
  assert.equal(blocked.statusCode,503);assert.match(blocked.json().message,/写操作暂时暂停/);assert.deepEqual(document(privateDoc.id),before);
  assert.equal((await app.inject({url:'/api/documents',headers})).statusCode,200);
  assert.equal((await app.inject({url:'/api/health'})).json().writes,0);
  await writeUpdateFile(path.join(data,'system-update/status.json'),{...liveState,heartbeatAt:new Date(Date.now()-60000).toISOString(),job:{status:'running',maintenance:true}});
  assert.equal(await systemUpdate.maintenance(),true);
 }finally{await app.close()}
});

test('定时调度跨重启保存间隔，失败暂停，手动恢复且请求不会重复执行',async()=>{
 const dataDir=await fresh(),options={dataDir},service=createSystemUpdate(dataDir);
 const state={startedAt:new Date(at-25*3600000).toISOString()};
 let executions=0;
 const execute=async(opts,{report})=>{executions++;await report({message:'隔离执行',maintenance:true});return {status:'failed',message:'模拟网络失败'}};
 await workerTick(options,state,{execute,now:at});assert.equal(executions,0);
 await service.configure({mode:'auto',intervalHours:24});
 await workerTick(options,state,{execute,now:at});assert.equal(executions,1);assert.equal(state.paused,true);assert.equal(state.job.trigger,'auto');assert.equal(state.job.maintenance,false);
 assert.equal((await service.status()).pending,null);
 await workerTick(options,state,{execute,now:at+48*3600000});assert.equal(executions,1);
 await publishUpdateRequest(path.join(dataDir,'system-update'),{id:randomUUID(),trigger:'manual',requestedAt:new Date().toISOString()});
 await workerTick(options,state,{execute:async()=>({status:'unchanged',to:'b'.repeat(40),message:'最新'}),now:at});
 assert.equal(state.paused,false);assert.equal(state.revision,'b'.repeat(40));assert.equal(state.job.trigger,'manual');
 assert.ok(nextUpdateAt({mode:'auto',intervalHours:6},JSON.parse(JSON.stringify(state))));
 assert.equal(nextUpdateAt({mode:'manual',intervalHours:6},state),null);
 await workerTick(options,state,{execute,now:Date.now()});assert.equal(executions,1);
});

test('执行器配置只接受固定 GitHub 来源、本机健康地址和合法分支',()=>{
 assert.equal(workerOptions({UPDATE_PROJECT:'blog'}).branch,'main');
 for(const env of [{UPDATE_PROJECT:'blog',UPDATE_REPOSITORY:'https://evil.example/repo'},{UPDATE_PROJECT:'blog',UPDATE_BRANCH:'--upload-pack=anything'},{UPDATE_PROJECT:'blog',UPDATE_BRANCH:'a/../b'},{UPDATE_PROJECT:'blog',UPDATE_HEALTH_URL:'https://evil.example/api/health'},{}])assert.throws(()=>workerOptions(env));
});

async function scenario({failAt,dirty=false,diverged=false,same=false,stale=false,contractChanged=false,publishDuringBuild=false,rollbackFails=false}={}){
 const repoDir=await fresh(),dataDir=path.join(repoDir,'data');
 await fs.mkdir(path.join(dataDir,'backups'),{recursive:true});
 const from='a'.repeat(40),to=same?from:'b'.repeat(40),oldImage='sha256:'+'c'.repeat(64),backup='2026-11-02-12345678-1234-1234-1234-123456789abc.zip';
 await fs.writeFile(path.join(dataDir,'application-revision'),from);await fs.symlink('/app/data/releases/old',path.join(dataDir,'current'));await fs.writeFile(path.join(dataDir,'backups',backup),'fake isolated backup');
 let head=from,stopped=false,newService=false;
 const calls=[],reports=[];
 const config={services:{blog:{image:'undefim-blog:local',volumes:[{type:'bind',source:dataDir,target:'/app/data'}],ports:[{target:4322,published:'4322'}]}}};
 const run=async(program,args)=>{
  const command=args.join(' ');calls.push(`${program} ${command}`);
  if(program==='git'){
   if(command.includes('status --porcelain'))return dirty?' M server/index.mjs':'';
   if(command.includes('rev-parse --show-toplevel'))return repoDir;
   if(command.includes('branch --show-current'))return 'main';
   if(command.includes('remote get-url'))return 'https://github.com/example/blog.git';
   if(command.includes('rev-parse HEAD'))return head;
   if(command.includes('rev-parse refs/remotes'))return to;
   if(command.includes('merge-base')&&diverged)throw new Error('diverged');
   if(command.includes('merge --ff-only')){head=to;return ''}
   if(command.includes('reset --hard')){head=from;return ''}
   return '';
  }
  if(command.includes('config --format'))return JSON.stringify(contractChanged&&command.includes('/source/')?{services:{blog:{...config.services.blog,image:'different:tag'}}}:config);
  if(command.includes('ps -q'))return 'd'.repeat(64);
  if(command.startsWith('inspect'))return oldImage;
  if(command.endsWith('build blog')){if(failAt==='build')throw new Error('模拟镜像构建失败');if(publishDuringBuild){await fs.unlink(path.join(dataDir,'current'));await fs.symlink('/app/data/releases/after-unpublish',path.join(dataDir,'current'))}}
  if(command.includes('exec -T blog node scripts/backup.mjs')){if(failAt==='backup')throw new Error('模拟备份失败');return `/app/data/backups/${backup}`}
  if(command.includes('stop blog'))stopped=true;
  if(command.includes('up -d')&&rollbackFails&&head===from)throw new Error('模拟旧服务恢复失败');
  if(command.includes('up -d')){newService=head===to;stopped=false;if(newService&&failAt==='startup')throw new Error('模拟服务启动失败');if(head===to)await fs.writeFile(path.join(dataDir,'application-revision'),to)}
  return '';
 };
 let healthChecks=0;
 const health=async()=>({ok:true,revision:stale?'e'.repeat(40):head,publishing:0,writes:0});
 const wait=async(fn,predicate)=>{healthChecks++;if(failAt==='health'&&newService&&head===to)throw new Error('模拟新服务健康检查失败');assert.equal(predicate(await fn()),true)};
 const result=await executeUpdate({repoDir,dataDir,repository:'example/blog',branch:'main',project:'blog',healthUrl:'http://127.0.0.1:4322/api/health'},{run,health,wait,report:async change=>reports.push(change)});
 return {result,calls,reports,head,from,to,stopped,healthChecks,dataDir};
}

test('无更新不备份或重启，运行版本落后时仍修复部署',async()=>{
 const {result,calls}=await scenario({same:true});assert.equal(result.status,'unchanged');assert.ok(!calls.some(c=>c.startsWith('docker')));
 const stale=await scenario({same:true,stale:true});assert.equal(stale.result.status,'failed');
 assert.ok(stale.calls.some(c=>c.endsWith('build blog')));
});

test('部署仅快进，脏工作区、分叉或数据契约变化均不停止现有服务',async()=>{
 for(const option of [{dirty:true},{diverged:true},{contractChanged:true}]){
  const {result,calls}=await scenario(option);assert.equal(result.status,'failed');assert.ok(!calls.some(c=>c.includes('stop blog')));assert.ok(!calls.some(c=>c.includes('reset --hard')));
 }
});

test('更新严格按构建、排空、备份、停服、重建快照和健康检查执行',async()=>{
 const {result,calls,reports,head,to,healthChecks}=await scenario();
 assert.equal(result.status,'success');assert.equal(head,to);assert.equal(healthChecks,2);
 const build=calls.findIndex(c=>c.endsWith('build blog')),backup=calls.findIndex(c=>c.includes('exec -T blog node scripts/backup.mjs')),stop=calls.findIndex(c=>c.includes('stop blog')),up=calls.findIndex(c=>c.includes('up -d'));
 assert.ok(build<backup&&backup<stop&&stop<up);assert.ok(reports.some(r=>r.maintenance===true));assert.ok(result.backup.endsWith('.zip'));
 assert.ok(!calls.some(c=>/import-halo|npm run import|docker.sock/.test(c)));
});

test('构建或备份失败不切换服务，切换后异常恢复旧代码镜像而不恢复旧数据库',async()=>{
 for(const failAt of ['build','backup']){const {result,calls}=await scenario({failAt});assert.equal(result.status,'failed');assert.ok(!calls.some(c=>c.includes('stop blog')));assert.ok(!calls.some(c=>c.includes('merge --ff-only')))}
 const result=await scenario({failAt:'health'});
 assert.equal(result.result.status,'failed');assert.match(result.result.rollback,/已恢复旧代码/);assert.equal(result.head,result.from);assert.equal(result.stopped,false);
 assert.equal(await fs.readlink(path.join(result.dataDir,'current')),'/app/data/releases/old');assert.equal(await fs.readFile(path.join(result.dataDir,'application-revision'),'utf8'),result.from);
 assert.ok(!result.calls.some(c=>/sqlite|restore|unzip/.test(c)));
});

test('回退捕获排空后的静态入口，不重新公开构建期间已经撤下的内容',async()=>{
 const result=await scenario({failAt:'health',publishDuringBuild:true});
 assert.equal(result.result.status,'failed');assert.match(result.result.rollback,/已恢复/);
 assert.equal(await fs.readlink(path.join(result.dataDir,'current')),'/app/data/releases/after-unpublish');
 const broken=await scenario({failAt:'health',rollbackFails:true});assert.equal(broken.result.maintenance,true);
});

test('首次自动调度基准不因执行器重新启动推迟，恢复失败时保持写屏障',async()=>{
 const config={mode:'auto',intervalHours:24},anchor='2026-11-01T00:00:00Z';
 assert.equal(nextUpdateAt(config,{scheduleAnchorAt:anchor,startedAt:'2026-11-01T23:00:00Z'}),'2026-11-02T00:00:00.000Z');
 const dataDir=await fresh(),state={job:{status:'failed',maintenance:true},paused:true};
 await publishUpdateRequest(path.join(dataDir,'system-update'),{id:randomUUID(),trigger:'manual'});
 await workerTick({dataDir},state,{execute:async()=>({status:'failed',message:'恢复仍失败'})});
 assert.equal(state.job.maintenance,true);assert.equal(await createSystemUpdate(dataDir).maintenance(),true);
 await publishUpdateRequest(path.join(dataDir,'system-update'),{id:randomUUID(),trigger:'manual'});
 await workerTick({dataDir},state,{execute:async()=>({status:'unchanged',message:'版本一致',to:'a'.repeat(40)})});
 assert.equal(state.job.maintenance,false);assert.equal(state.paused,false);
});

test('写请求在异步维护检查开始即计数，检查完成前不能视为排空',async()=>{
 let release,entered;const waiting=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{entered=resolve});
 const app=await createApp({systemUpdate:{maintenance:async()=>{entered();await waiting;return false}}});
 app.post('/api/test-delayed-write',async()=>({ok:true}));
 try{const pending=app.inject({method:'POST',url:'/api/test-delayed-write'});pending.then(()=>{});await started;
  assert.equal((await app.inject({url:'/api/health'})).json().writes,1);release();await pending;
  assert.equal((await app.inject({url:'/api/health'})).json().writes,0);
 }finally{release();await app.close()}
});

test('客户端中断上传不提前释放仍在执行的异步业务计数',{timeout:10000},async()=>{
 let release,entered,aborted,finished;
 const hold=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{entered=resolve}),abort=new Promise(resolve=>{aborted=resolve}),done=new Promise(resolve=>{finished=resolve});
 const app=await createApp({systemUpdate:{maintenance:async()=>false}});
 app.addHook('onRequestAbort',async _req=>{aborted()});
 app.post('/api/test-aborted-write',async()=>{entered();await hold;finished();return {ok:true}});
 let request;
 try{
  await app.listen({host:'127.0.0.1',port:0});
  const {port}=app.server.address();
  request=http.request({hostname:'127.0.0.1',port,path:'/api/test-aborted-write',method:'POST',headers:{'content-type':'multipart/form-data; boundary=isolated-upload','transfer-encoding':'chunked'}});
  request.on('error',()=>{});request.write('--isolated-upload\r\nContent-Disposition: form-data; name="file"; filename="test.md"\r\nContent-Type: text/markdown\r\n\r\npartial');
  await started;request.destroy();await abort;
  assert.equal((await app.inject({url:'/api/health'})).json().writes,1);
  release();await done;await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await app.inject({url:'/api/health'})).json().writes,0);
 }finally{request?.destroy();release();await app.close()}
});

test('健康检查有界等待，不将旧进程或静态构建未完成视为成功',async()=>{
 let calls=0;await assert.rejects(()=>waitForHealth(async()=>{calls++;return {ok:true,revision:'old'}},value=>value.revision==='new',{attempts:2,delay:0}));assert.equal(calls,2);
});

test('真实初始化按镜像版本重建公开快照，同版本重启不重复构建，草稿和私密不泄漏',async()=>{
 const dataDir=await fresh(),exec=promisify(execFile);
 const env={...process.env,DATA_DIR:dataDir,APP_REVISION:'1'.repeat(40),ASTRO_TELEMETRY_DISABLED:'1'};
 delete env.CONTENT_SNAPSHOT;delete env.BUILD_DIR;
 const seed=`
  import fs from 'node:fs/promises';import path from 'node:path';
  const {db,dataDir,saveDocument,trash}=await import('./server/db.mjs');
  db.prepare('INSERT INTO users VALUES (?,?)').run('isolated-test','unused-hash');
  const base={kind:'post',title:'公开基线',path:'/archives/update-seed',format:'markdown',markdown:'public-before-update',date:'2026-11-02T00:00:00Z',visibility:'public',categories:[],tags:[]};
  const published=saveDocument(base,'test',true);
  saveDocument({...published,markdown:'secret-unpublished-draft'});
  saveDocument({...base,path:'/archives/update-private-seed',visibility:'private',markdown:'secret-private-body'});
  const deleted=saveDocument({...base,path:'/archives/update-deleted-seed',markdown:'secret-trash-body'});trash(deleted.id);
  await fs.mkdir(path.join(dataDir,'old/site'),{recursive:true});await fs.writeFile(path.join(dataDir,'old/site/index.html'),'old');await fs.symlink(path.join(dataDir,'old'),path.join(dataDir,'current'));await fs.writeFile(path.join(dataDir,'application-revision'),'old');
 `;
 await exec(process.execPath,['--input-type=module','-e',seed],{cwd:process.cwd(),env,timeout:120000});
 await exec(process.execPath,['scripts/initialize.mjs'],{cwd:process.cwd(),env,timeout:120000});
 const first=await fs.readlink(path.join(dataDir,'current'));
 const snapshot=await fs.readFile(path.join(dataDir,'current/content.json'),'utf8');
 assert.match(snapshot,/public-before-update/);assert.doesNotMatch(snapshot,/secret-unpublished-draft|secret-private-body|secret-trash-body/);
 assert.equal(JSON.parse(snapshot).documents.length,1);assert.equal(await fs.readFile(path.join(dataDir,'application-revision'),'utf8'),env.APP_REVISION);
 await exec(process.execPath,['scripts/initialize.mjs'],{cwd:process.cwd(),env,timeout:120000});
 assert.equal(await fs.readlink(path.join(dataDir,'current')),first);
 const themeFlow=await exec(process.execPath,['--input-type=module','-e',`
  import fs from 'node:fs/promises';import path from 'node:path';
  const {createApp}=await import('./server/index.mjs');const {createSession}=await import('./server/auth.mjs');const {db,dataDir}=await import('./server/db.mjs');const {settledBuilds}=await import('./server/publish.mjs');
  const app=await createApp();const session=createSession('isolated-test');const headers={cookie:'blog_session='+session.token,'x-csrf-token':session.csrf};
  const saved=await app.inject({method:'PUT',url:'/api/settings',headers,payload:{siteTheme:'kiln'}});
  const before=JSON.parse(await fs.readFile(path.join(dataDir,'current/content.json'),'utf8')).settings.siteTheme;
  const submitted=await app.inject({method:'POST',url:'/api/build',headers});await settledBuilds();
  const status=db.prepare('SELECT status FROM jobs WHERE id=?').get(submitted.json().job).status;
  const after=JSON.parse(await fs.readFile(path.join(dataDir,'current/content.json'),'utf8')).settings.siteTheme;
  console.log(JSON.stringify({saved:saved.statusCode,before,after,status}));await app.close();
 `],{cwd:process.cwd(),env,timeout:120000});
 assert.deepEqual(JSON.parse(themeFlow.stdout),{saved:200,before:'dream',after:'kiln',status:'success'});
 assert.match(await fs.readFile(path.join(dataDir,'current/site/index.html'),'utf8'),/data-skin="kiln"/);
 const afterTheme=await fs.readlink(path.join(dataDir,'current'));
 await exec(process.execPath,['scripts/initialize.mjs'],{cwd:process.cwd(),env:{...env,APP_REVISION:'2'.repeat(40)},timeout:120000});
 assert.notEqual(await fs.readlink(path.join(dataDir,'current')),afterTheme);
 assert.notEqual(await fs.readlink(path.join(dataDir,'current')),first);
 const verification=await exec(process.execPath,['--input-type=module','-e',`const {db,documents}=await import('./server/db.mjs');console.log(JSON.stringify({documents:documents(),trash:documents({deleted:true}),revisions:db.prepare('SELECT COUNT(*) AS n FROM revisions').get().n}));`],{cwd:process.cwd(),env,timeout:120000});
 const records=JSON.parse(verification.stdout);
 assert.equal(records.documents.length,2);assert.equal(records.trash.length,1);assert.equal(records.revisions,1);
 assert.ok(records.documents.some(d=>d.markdown==='secret-unpublished-draft'));assert.ok(records.documents.some(d=>d.visibility==='private'&&d.markdown==='secret-private-body'));
});

test.after(async()=>{db.close();await fs.rm(root,{recursive:true,force:true})});
