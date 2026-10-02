import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {db} from './db.mjs';
export const tokenHash=value=>createHash('sha256').update(value).digest('hex');
export function passwordHash(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`}
export function verifyPassword(password,hash){try{const [salt,key]=hash.split(':');const actual=scryptSync(password,salt,64);const expected=Buffer.from(key,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected)}catch{return false}}
export function createSession(username){const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(tokenHash(token),username,Date.now()+7*86400000,csrf);db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());return {token,csrf,username}}
export function session(token){if(!token)return null;return db.prepare('SELECT username,csrf FROM sessions WHERE token_hash=? AND expires_at>?').get(tokenHash(token),Date.now())||null}
