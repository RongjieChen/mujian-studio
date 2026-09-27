import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sampleCase } from '../src/core/sample.ts';
import { assertRepairPreservesStory } from '../src/core/repair.ts';
import { narrativeSources,validateNarrativeSubmission } from '../src/core/narrative.ts';
import { decodeUpload } from '../src/server/security.ts';
import { reduceGame,initialState } from '../src/core/game.ts';
import type { Action } from '../src/core/schema.ts';

test('repair cannot pass by deleting evidence, rewriting testimony or changing the truth',()=>{
  for(const mutate of [
    (d:typeof sampleCase)=>{d.clues.pop();},
    (d:typeof sampleCase)=>{d.characters[0].topics[0].answer='换一套无矛盾的说法';},
    (d:typeof sampleCase)=>{d.truth.requiredEvidenceIds=[];},
    (d:typeof sampleCase)=>{d.truth.culpritId=d.characters[1].id;},
    (d:typeof sampleCase)=>{d.clues[0].id='replacement';},
  ]){const d=structuredClone(sampleCase);mutate(d);assert.throws(()=>assertRepairPreservesStory(sampleCase,d));}
  const repaired=structuredClone(sampleCase);repaired.clues[0].requires=[];repaired.scenes[1].requires=[];
  assert.doesNotThrow(()=>assertRepairPreservesStory(sampleCase,repaired));
});
test('unknown player actions cannot be treated as an accusation',()=>{
  const state=initialState(sampleCase);state.inventory=[...sampleCase.truth.requiredEvidenceIds];
  assert.throws(()=>reduceGame(sampleCase,state,{type:'win',characterId:sampleCase.truth.culpritId,evidenceIds:state.inventory} as unknown as Action));
  assert.equal(state.ending,null);
});
test('review rejects invented quotation, prototype paths and one-source contradictions',()=>{
  const sources=narrativeSources(sampleCase);
  assert.equal(Object.getPrototypeOf(sources),null);
  const review={summary:'本次审阅有需要作者进一步确认的疑点。',issues:[{kind:'contradiction',severity:'concern',explanation:'两个可靠事实可能在相同时间互相冲突。',suggestion:'请作者核实原文时间与证据可靠性。',citations:[{path:'/truth/method',quote:sampleCase.truth.method.slice(0,10)},{path:'/truth/motive',quote:sampleCase.truth.motive.slice(0,10)}]}]};
  assert.doesNotThrow(()=>validateNarrativeSubmission(sampleCase,review));
  const fake=structuredClone(review);fake.issues[0].citations[1].quote='这是不存在于原文的证据';assert.throws(()=>validateNarrativeSubmission(sampleCase,fake),/原文引用/);
  fake.issues[0].citations[1].path='/__proto__/x';assert.throws(()=>validateNarrativeSubmission(sampleCase,fake));
  const one=structuredClone(review);one.issues[0].citations.pop();assert.throws(()=>validateNarrativeSubmission(sampleCase,one),/两个不同/);
});
test('image imports fully decode rather than trusting magic bytes',async()=>{
  const real=await sharp({create:{width:24,height:16,channels:3,background:'#abcdef'}}).png().toBuffer();
  const normalized=await decodeUpload(real);assert.equal((await sharp(normalized).metadata()).width,24);
  await assert.rejects(decodeUpload(Buffer.concat([real.subarray(0,8),Buffer.alloc(200)])),/无法完整解码/);
  await assert.rejects(decodeUpload(real.subarray(0,real.length/2)),/无法完整解码/);
  await assert.rejects(decodeUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),/无法完整解码/);
});
