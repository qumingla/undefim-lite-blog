import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {importMarkdown,renderMarkdown,safeHtml} from '../server/markdown.mjs';

test('Front Matter 保留历史 YAML 字段、合并键、JSON、BOM/CRLF 与原正文',()=>{
 const body='\r\n# 正文\r\n\r\n---\r\n后续分隔线\r\n';
 const d=importMarkdown('\uFEFF---yaml\r\ndefaults: &defaults {author: 作者, comments: false}\r\n<<: *defaults\r\ntitle: 历史文章\r\nslug: legacy\r\ndate: 2026-10-02\r\ntags: [Linux, Node]\r\npinned: yes\r\nlicenseName: 自定义协议\r\n---\r\n'+body,'legacy.md');
 assert.equal(d.markdown,body);assert.equal(d.date,'2026-10-02T00:00:00.000Z');
 assert.equal(d.path,'/archives/legacy');assert.equal(d.title,'历史文章');
 assert.equal(d.author,'作者');assert.equal(d.allowComment,false);assert.equal(d.pinned,true);
 assert.deepEqual(d.tags,['Linux','Node']);assert.equal(d.licenseName,'自定义协议');
 const json=importMarkdown('---json\n{"title":"JSON 文章","permalink":"/legacy","copyrightEnabled":false}\n---\n正文');
 assert.equal(json.title,'JSON 文章');assert.equal(json.path,'/legacy');assert.equal(json.copyrightEnabled,false);
 for(const text of ['# 无元数据\n正文','----\n普通分隔线','---\n---\n正文']) {
  assert.equal(importMarkdown(text).markdown,text==='---\n---\n正文'?'正文':text);
 }
});

test('Front Matter 拒绝代码执行、非对象、未闭合元数据及别名膨胀',()=>{
 for(const language of ['js','javascript','JS','toml']) {
  assert.throws(()=>importMarkdown(`---${language}\n(globalThis.frontMatterExecuted=true,{title:'执行'})\n---\n正文`),/仅支持 YAML 或 JSON/);
 }
 assert.equal(globalThis.frontMatterExecuted,undefined);
 for(const raw of ['- title','42','true'])assert.throws(()=>importMarkdown(`---\n${raw}\n---\n正文`),/必须是字段对象/);
 assert.throws(()=>importMarkdown('---\ntitle: 未闭合'),/缺少结束分隔符/);
 assert.throws(()=>importMarkdown('---\nx: !<tag:yaml.org,2002:js/function> function() {}\n---\n正文'));
 const aliases=['a: &a [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]'];
 for(let i=1;i<5;i++)aliases.push(`${String.fromCharCode(97+i)}: &${String.fromCharCode(97+i)} [${Array(10).fill(`*${String.fromCharCode(96+i)}`).join(', ')}]`);
 assert.throws(()=>importMarkdown(`---\n${aliases.join('\n')}\n---\n正文`),/alias|resource/i);
});

test('升级后的公式和 HTML 清洗保持渲染与不可信链接防护',async()=>{
 const html=await renderMarkdown('# 公式\n\n$x^2 + y^2$\n\n$$\\frac{1}{2}$$\n\n$\\href{javascript:alert(1)}{bad}$\n\n<script>alert(1)</script>');
 assert.match(html,/class="katex"/);assert.match(html,/<math[^>]+display="block"/);assert.match(html,/<msup>/);assert.match(html,/<mfrac>/);
 assert.doesNotMatch(html,/katex-html|<svg|style="[^"]*(?:top|height|position):/);
 assert.doesNotMatch(html,/<script|href="javascript:|onerror=/i);
 assert.doesNotMatch(safeHtml('<iframe src="javascript:alert(1)"><script>alert(1)</script></iframe>'),/src="javascript:|<script/i);
 const matrix=await renderMarkdown('$$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$$');
 assert.match(matrix,/<mtable[^>]+columnalign="center center"/);assert.match(matrix,/<mstyle scriptlevel="0" displaystyle="false"/);
 assert.doesNotMatch(safeHtml('<math href="javascript:alert(1)"><mstyle onload="alert(1)" style="position:fixed"><mi href="https://example.com">x</mi></mstyle></math>'),/href=|onload=|style=/);
});

test('畸形多行 Markdown 引用在独立进程中及时完成',async()=>{
 // CVE-2026-111758: an unclosed reference must not block the service for seconds.
 const moduleUrl=new URL('../server/markdown.mjs',import.meta.url).href;
 const code=`const {renderMarkdown}=await import(${JSON.stringify(moduleUrl)});await renderMarkdown('[label]: /url "'+('x'.repeat(80)+'\\n').repeat(5000));`;
 await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{timeout:5000,maxBuffer:1024*1024});
});
