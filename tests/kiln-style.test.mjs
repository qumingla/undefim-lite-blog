import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const css=await fs.readFile(new URL('../src/styles/kiln-creatures.css',import.meta.url),'utf8');
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));
const find=part=>rules.filter(r=>r.selector.split(',').some(s=>s.trim().endsWith(part)));

test('营火三帧火焰的错开延迟由同一周期变量推导，加速时不会出现空帧或叠帧',()=>{
 const base=find(' .flame-frame');
 assert.equal(base.length,1);
 assert.match(base[0].body,/animation:\s*kiln-flame-frame var\(--flame-t\) steps\(1\) infinite/);
 assert.match(find(' .flame-2')[0].body,/animation-delay:\s*calc\(var\(--flame-t\)\s*\/\s*-3\)/);
 assert.match(find(' .flame-3')[0].body,/animation-delay:\s*calc\(var\(--flame-t\)\s*\*\s*-2\s*\/\s*3\)/);
 // Changing only the duration of a frame (instead of --flame-t) would desynchronise the three frames.
 for(const rule of rules.filter(r=>/\.flame-frame\b/.test(r.selector)))assert.doesNotMatch(rule.body,/animation-duration/,rule.selector);
 const stoked=find('[data-stoked] .fire-flames');
 assert.equal(stoked.length,1);assert.match(stoked[0].body,/--flame-t:\s*[.\d]+s/);
 assert.match(find(' .fire-flames')[0].body,/--flame-t:\s*[.\d]+s/);
});
