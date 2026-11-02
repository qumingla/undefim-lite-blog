import fs from 'node:fs/promises';import path from 'node:path';import {db,dataDir} from '../server/db.mjs';import {enqueueBuild,settledBuilds} from '../server/publish.mjs';
if(!db.prepare('SELECT COUNT(*) AS n FROM users').get().n)await import('./create-admin.mjs');
const revision=process.env.APP_REVISION;
const marker=path.join(dataDir,'application-revision');
let rebuild=false;
try{await fs.access(path.join(dataDir,'current/site/index.html'))}catch{rebuild=true}
if(revision&&revision!=='unknown'){let previous='';try{previous=await fs.readFile(marker,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}if(previous!==revision)rebuild=true}
if(rebuild){const id=enqueueBuild();await settledBuilds();const job=db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(job.status!=='success'){console.error('静态构建失败，请在受保护的发布记录中查看详情。');process.exit(1)}console.log('已发布快照的静态版本已生成。')}
if(revision&&revision!=='unknown')await fs.writeFile(marker,revision,{mode:0o600});
