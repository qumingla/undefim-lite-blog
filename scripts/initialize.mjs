import fs from 'node:fs/promises';import path from 'node:path';import {db,dataDir} from '../server/db.mjs';import {enqueueBuild,settledBuilds} from '../server/publish.mjs';
if(!db.prepare('SELECT COUNT(*) AS n FROM users').get().n)await import('./create-admin.mjs');
try{await fs.access(path.join(dataDir,'current/site/index.html'))}catch{const id=enqueueBuild();await settledBuilds();const job=db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(job.status!=='success'){console.error(job.log);process.exit(1)}console.log('初始静态版本已生成。')}
