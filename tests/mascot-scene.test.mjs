import test from 'node:test';
import assert from 'node:assert/strict';
import {hillHeightAt,climbPath,pickAction,actionWeights} from '../src/scripts/mascot-scene.ts';

const hill={left:10,width:96,height:24,profile:[1,1,2,3,3,4,5,5,6,7,7,8,8,8,8,8,8,8,8,8,7,7,6,5,5,4,3,3,2,1,1,1]};

test('吉祥物登山高度沿绘制的山坡，山外为地面',()=>{
 assert.equal(hillHeightAt(hill,0),0);assert.equal(hillHeightAt(hill,200),0);
 assert.equal(hillHeightAt(hill,hill.left+hill.width/2),24);
 assert.equal(hillHeightAt(hill,hill.left+1),3);
 assert.equal(hillHeightAt({...hill,profile:[]},50),0);
 const path=climbPath(hill,hill.left+hill.width+4,hill.left+hill.width/2,6);
 assert.equal(path.length,6);assert.equal(path.at(-1).x,hill.left+hill.width/2);assert.equal(path.at(-1).lift,24);
 for(let i=1;i<path.length;i++)assert.ok(path[i].lift>=path[i-1].lift,'向山顶攀登时不应下降');
});

test('吉祥物动作按权重选择且不连续重复同一场景',()=>{
 const names=Object.keys(actionWeights);
 const seen=new Set();for(let i=0;i<200;i++)seen.add(pickAction(i/200));
 assert.deepEqual([...seen].sort(),names.sort());
 for(const previous of names.filter(n=>n!=='wander'))for(let i=0;i<100;i++)assert.notEqual(pickAction(i/100,previous),previous);
 assert.equal(pickAction(0),'wander');assert.ok(names.includes(pickAction(1)));assert.ok(names.includes(pickAction(-1)));
});
