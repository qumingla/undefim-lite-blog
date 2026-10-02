import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {db, dataDir} from '../server/db.mjs';
import {createBackup} from '../server/backup.mjs';
const file = await createBackup();
const zip = await JSZip.loadAsync(await fs.readFile(file));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'undefim-backup-'));
const snapshot = path.join(temp, 'blog.sqlite');
try {
 await fs.writeFile(snapshot, await zip.file('blog.sqlite').async('nodebuffer'), {mode:0o600});
 const restored = new DatabaseSync(snapshot, {readOnly:true});
 const integrity = restored.prepare('PRAGMA integrity_check').get().integrity_check;
 if (integrity !== 'ok') throw new Error('Restored database integrity failed');
 const counts = {};
 for (const table of ['documents','revisions','comments','settings','media','users','stats']) {
  const source = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const actual = restored.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  if (source !== actual) throw new Error(`Restored ${table} count mismatch`);
  counts[table] = actual;
 }
 let mediaVerified = 0;
 for (const item of restored.prepare('SELECT path,sha256 FROM media').all()) {
  const entry = zip.file('media/' + item.path.replace(/^\//,''));
  if (!entry) throw new Error('Missing backup media: ' + item.path);
  const hash = createHash('sha256').update(await entry.async('nodebuffer')).digest('hex');
  if (hash !== item.sha256) throw new Error('Backup media hash mismatch: ' + item.path);
  mediaVerified++;
 }
 restored.close();
 const report = {checkedAt:new Date().toISOString(),backup:path.basename(file),integrity,counts,mediaVerified};
 await fs.writeFile(path.join(dataDir,'backup-verification.json'), JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
} finally { await fs.rm(temp,{recursive:true,force:true}); }
