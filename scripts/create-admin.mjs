import {randomBytes} from 'node:crypto';import fs from 'node:fs/promises';import path from 'node:path';import {db,dataDir} from '../server/db.mjs';import {passwordHash} from '../server/auth.mjs';
const name=process.env.ADMIN_NAME||'undefim';const password=process.env.ADMIN_PASSWORD||randomBytes(24).toString('base64url');if(password.length<14)throw new Error('密码至少 14 个字符');
if(db.prepare('SELECT name FROM users WHERE name=?').get(name))throw new Error('管理员已存在；请通过账户设置修改密码');
db.prepare('INSERT INTO users VALUES (?,?)').run(name,passwordHash(password));
const file=path.join(dataDir,'admin-access.txt');await fs.writeFile(file,`后台：/admin/\n用户名：${name}\n初始密码：${password}\n首次登录后请修改密码，并删除此文件。\n`,{mode:0o600});console.log(`管理员已建立，凭据保存在 ${file}（权限 600）`);
