import {posts,summary} from '../lib/content.mjs';
export function GET(){return new Response(JSON.stringify(posts.map((p:any)=>({title:p.title,path:p.path,excerpt:summary(p),text:(p.markdown||p.html||'').replace(/<[^>]+>/g,'')}))),{headers:{'Content-Type':'application/json; charset=utf-8'}})}
