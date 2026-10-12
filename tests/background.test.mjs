import test from 'node:test';
import assert from 'node:assert/strict';
import {startBackground} from '../src/scripts/background.ts';

function browser(t,{reduced=false,hidden=false}={}) {
 const win=Object.assign(new EventTarget(),{innerWidth:1440,innerHeight:900,devicePixelRatio:3});
 const doc=Object.assign(new EventTarget(),{hidden});
 const motion=Object.assign(new EventTarget(),{matches:reduced});
 const frames=new Map();let id=0,clears=0;
 const restore=[];let cleanup=()=>{};
 const replacements={window:win,document:doc,matchMedia:()=>motion,requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)};
 for(const [key,value] of Object.entries(replacements)) {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  restore.push(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]});
 }
 t.after(()=>{cleanup();for(const reset of restore)reset()});
 const ctx={setTransform(){},clearRect(){clears++},fillRect(){},beginPath(){},arc(){},fill(){},createLinearGradient(){return {addColorStop(){}}},moveTo(){},lineTo(){},stroke(){}};
 const canvas={dataset:{},getContext:()=>ctx};
 const tick=now=>{const [key,fn]=frames.entries().next().value;frames.delete(key);fn(now)};
 return {win,doc,motion,frames,canvas,tick,setCleanup:fn=>cleanup=fn,get clears(){return clears}};
}

test('背景动画在隐藏页面/减少动态偏好时停止，恢复时只有一条动画循环',t=>{
 const b=browser(t);const stop=startBackground(b.canvas);b.setCleanup(stop);
 assert.equal(b.frames.size,1);b.tick(100);assert.equal(b.canvas.dataset.motion,'running');
 b.doc.hidden=true;b.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(b.frames.size,0);
 b.doc.hidden=false;b.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(b.frames.size,1);
 b.motion.matches=true;b.motion.dispatchEvent(new Event('change'));assert.equal(b.frames.size,0);assert.equal(b.canvas.dataset.motion,'reduced');
 const clears=b.clears;b.motion.matches=false;b.motion.dispatchEvent(new Event('change'));assert.equal(b.frames.size,1);assert.ok(b.clears>clears);
 b.win.dispatchEvent(new Event('pageshow'));assert.equal(b.frames.size,1);
 b.win.dispatchEvent(new Event('pagehide'));assert.equal(b.frames.size,0);
 stop();b.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(b.frames.size,0);
});

test('减少动态模式初始不启动帧循环，高清画布受限并随手机尺寸调整',t=>{
 const b=browser(t,{reduced:true});const stop=startBackground(b.canvas);b.setCleanup(stop);
 assert.equal(b.frames.size,0);assert.equal(b.canvas.dataset.motion,'reduced');
 assert.equal(b.canvas.width,2880);assert.equal(b.canvas.height,1800);
 b.win.innerWidth=390;b.win.innerHeight=844;b.win.dispatchEvent(new Event('resize'));
 assert.equal(b.canvas.width,780);assert.equal(b.canvas.height,1688);assert.equal(b.frames.size,0);
});
