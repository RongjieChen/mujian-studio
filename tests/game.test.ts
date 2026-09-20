import test from 'node:test';
import assert from 'node:assert/strict';
import { caseSchema } from '../src/core/schema.ts';
import { sampleCase } from '../src/core/sample.ts';
import { validateCase, revisionDiff, hashObject, sceneInput } from '../src/core/validate.ts';
import { initialState, reduceGame, availableTopics } from '../src/core/game.ts';

test('sample schema and validator produce a replayable solution',()=>{
  const doc=caseSchema.parse(sampleCase);const report=validateCase(doc);assert.equal(report.passed,true);
  let state=initialState(doc);for(const action of report.winningPath)state=reduceGame(doc,state,action);
  assert.equal(doc.endings.find(e=>e.id===state.ending)?.kind,'solved');assert.equal(state.inventory.length,6);
});
test('unseen scenes and evidence cannot be accessed by guessed IDs',()=>{
  const state=initialState(sampleCase);
  assert.throws(()=>reduceGame(sampleCase,state,{type:'travel',sceneId:'screening'}));
  assert.throws(()=>reduceGame(sampleCase,state,{type:'collect',clueId:'piano_tape'}));
  assert.throws(()=>reduceGame(sampleCase,state,{type:'accuse',characterId:'lin',evidenceIds:['witness']}));
  assert.throws(()=>reduceGame(sampleCase,state,{type:'ask',characterId:'chen',topicId:'corridor'}));
});
test('evidence gates a witness statement and topic never invents a clue',()=>{
  let state=initialState(sampleCase);
  state=reduceGame(sampleCase,state,{type:'collect',clueId:'power_log'});
  state=reduceGame(sampleCase,state,{type:'travel',sceneId:'screening'});
  assert(availableTopics(sampleCase,state,'chen').some(t=>t.id==='corridor'));
  state=reduceGame(sampleCase,state,{type:'ask',characterId:'chen',topicId:'corridor'});
  assert.deepEqual(state.inventory,['power_log','witness']);
  const again=reduceGame(sampleCase,state,{type:'ask',characterId:'chen',topicId:'corridor'});
  assert.deepEqual(again.inventory,state.inventory);
});
test('a correct suspect without the required evidence is not a successful solution',()=>{
  const state=reduceGame(sampleCase,initialState(sampleCase),{type:'accuse',characterId:'lin',evidenceIds:[]});
  assert.equal(state.ending,'wrong');assert.throws(()=>reduceGame(sampleCase,state,{type:'travel',sceneId:'tea'}));
});
test('critical evidence locked behind itself blocks export eligibility',()=>{
  const doc=structuredClone(sampleCase);doc.clues.find(c=>c.id==='power_log')!.sceneId='screening';
  const report=validateCase(doc);assert.equal(report.passed,false);assert(report.issues.some(i=>i.code==='NO_WINNING_PATH'));
  assert(report.issues.some(i=>i.code==='UNREACHABLE_SCENE'&&i.relatedIds.includes('screening')));
  assert.equal(report.winningPath.length,0);
});
test('a two-clue cycle is found even when both sources are open',()=>{
  const doc=structuredClone(sampleCase);doc.clues[0].requires=['piano_tape'];doc.clues.find(c=>c.id==='piano_tape')!.requires=['power_log'];
  const report=validateCase(doc);assert.equal(report.passed,false);assert(!report.reachableClues.includes('power_log'));assert(!report.reachableClues.includes('piano_tape'));
});
test('missing references, duplicate IDs, orphan testimony and mismatched guards are rejected',()=>{
  const mutations=[
    (d:typeof sampleCase)=>{d.scenes[0].requires=['missing'];},
    (d:typeof sampleCase)=>{d.clues[1].id=d.clues[0].id;},
    (d:typeof sampleCase)=>{d.characters[1].topics[1].reveals=[];},
    (d:typeof sampleCase)=>{d.characters[1].topics[1].requires=[];},
    (d:typeof sampleCase)=>{d.endings[1].kind='solved';},
  ];
  for(const mutate of mutations){const doc=structuredClone(sampleCase);mutate(doc);assert.equal(validateCase(doc).passed,false);}
});
test('the fixed-point validator does not depend on scene/clue traversal order',()=>{
  const doc=structuredClone(sampleCase);doc.scenes.reverse();doc.clues.reverse();doc.characters.reverse();
  const report=validateCase(doc);assert.equal(report.passed,true);
  let state=initialState(doc);for(const a of report.winningPath)state=reduceGame(doc,state,a);assert.equal(state.ending,'solved');
});
test('changing dialogue keeps visual cache valid; changing an actor invalidates only their scenes',()=>{
  const doc=structuredClone(sampleCase);doc.characters[0].topics[0].answer='我当时在茶室练琴。';
  assert.deepEqual(revisionDiff(sampleCase,doc).affectedScenes,[]);
  doc.characters[0].description='红色外套，齐肩短发。';
  assert.deepEqual(revisionDiff(sampleCase,doc).affectedScenes,['tea']);
  assert.notEqual(hashObject(sceneInput(sampleCase,'tea','image',42)),hashObject(sceneInput(doc,'tea','image',42)));
});
test('added entities are diffed without throwing on missing old values',()=>{
  const doc=structuredClone(sampleCase);doc.clues.push({id:'letter',name:'信封',description:'一封未寄出的信。',sceneId:'lobby',requires:[]});
  assert(revisionDiff(sampleCase,doc).changes.some(c=>c.id==='letter'&&c.kind==='added'));
});
test('all 64 subsets of sample evidence obey ending conditions',()=>{
  for(let mask=0;mask<64;mask++){
    const inventory=sampleCase.clues.filter((_,i)=>mask&(1<<i)).map(c=>c.id);
    for(const char of sampleCase.characters){
      const state={...initialState(sampleCase),inventory};
      const result=reduceGame(sampleCase,state,{type:'accuse',characterId:char.id,evidenceIds:inventory});
      const expected=char.id==='lin'&&sampleCase.truth.requiredEvidenceIds.every(id=>inventory.includes(id));
      assert.equal(result.ending,expected?'solved':'wrong');
    }
  }
});
