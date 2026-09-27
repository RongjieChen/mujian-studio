import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { caseSchema } from '../src/core/schema.ts';
import { hashObject,validateCase } from '../src/core/validate.ts';
import { initialState,reduceGame } from '../src/core/game.ts';
import { assertRepairPreservesStory } from '../src/core/repair.ts';
import { validateNarrativeSubmission } from '../src/core/narrative.ts';

const dir=path.resolve(process.argv[2]||'evidence/release-2026-09-27');
const read=(name:string)=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'));
const checks:unknown[]=[];
const before=read('deadlock-before'),after=read('deadlock-repair-project');
assertRepairPreservesStory(before.case,after.case);assert(!validateCase(before.case).passed);assert(validateCase(after.case).passed);
checks.push({name:'repair-protects-entire-story',passed:true,diff:read('repair-diff')});
for(const name of ['normal-audit','contradiction-audit','review-v2-normal','review-v2-conflict']){
  const p=read(name+'-project'),review=p.narrativeReview;
  assert.equal(review.caseHash,hashObject(p.case));validateNarrativeSubmission(p.case,review);
  assert.equal(p.revision,1);checks.push({name:name+'-literal-sources',passed:true,issues:review.issues.length});
}
for(const name of ['deadlock-repair-project','new-case-project','new-case-edit-project']){
  const p=read(name),doc=caseSchema.parse(p.case),report=validateCase(doc);
  assert(report.passed);const state=report.winningPath.reduce((state,action)=>reduceGame(doc,state,action),initialState(doc));
  assert.equal(state.ending,doc.endings.find(e=>e.kind==='solved')!.id);
  checks.push({name:name+'-replay',passed:true,steps:report.winningPath.length,caseHash:report.caseHash});
}
const old=read('new-case-before-edit').case,next=read('new-case-edit-project').case;
assert.notEqual(old.opening,next.opening);
assert.deepEqual({...old,opening:next.opening},next);
checks.push({name:'requested-edit-changes-only-opening',passed:true});
if(process.argv.includes('--complete')){
  const fresh=read('strict-generation-project'),edited=read('patch-opening-project');
  assert.equal(read('strict-generation-job').state,'succeeded');
  assert.deepEqual([fresh.case.characters.length,fresh.case.scenes.length,fresh.case.clues.length],[3,3,6]);
  assert.notEqual(fresh.case.opening,edited.case.opening);
  assert.deepEqual({...fresh.case,opening:edited.case.opening},edited.case);
  assert.equal(read('patch-opening-job').state,'succeeded');
  assert(read('patch-opening-job').events.some((e:any)=>e.type==='patch'&&e.detail?.field==='opening'));
  checks.push({name:'fresh-preset-and-real-patch-story',passed:true});
  const hostile=read('hostile-repair-before'),fixed=read('hostile-repair-project');
  assert.equal(read('hostile-repair-job').state,'succeeded');
  assertRepairPreservesStory(hostile.case,fixed.case);
  assert(!validateCase(hostile.case).passed);assert(validateCase(fixed.case).passed);
  checks.push({name:'real-hostile-story-data-cannot-rewrite-repair',passed:true});
  for(const name of ['strict-generation-project','patch-opening-project','hostile-repair-project','final-ready-project']){
    const p=read(name),doc=caseSchema.parse(p.case),report=validateCase(doc);assert(report.passed);
    const result=report.winningPath.reduce((state,action)=>reduceGame(doc,state,action),initialState(doc));
    assert.equal(result.ending,doc.endings.find(e=>e.kind==='solved')!.id);
    checks.push({name:name+'-replay',passed:true,caseHash:report.caseHash,steps:report.winningPath.length});
  }
  const ready=read('final-ready-project');assert.equal(ready.case.characters.length,3);
  const video=read('fresh-video-final-job');assert.equal(video.state,'succeeded');assert.equal(video.result.cacheHit,false);
  assert.deepEqual(video.result.asset.metadata.settings,{width:1280,height:704,num_frames:121,num_inference_steps:50,guidance_scale:5});
  const probe=read('formal-file-probe'),stream=probe.streams.find((s:any)=>s.codec_type==='video');
  assert(stream);assert.equal(stream.width,1280);assert.equal(stream.height,704);assert.equal(Number(stream.nb_frames),121);
  assert(!probe.streams.some((s:any)=>s.codec_type==='audio'));
  const browser=read('fresh-browser');assert.equal(browser.projectId,ready.id);assert.equal(browser.offline,true);
  assert.deepEqual(browser.errors,[]);assert.deepEqual(browser.externalRequests,[]);
  assert.equal(browser.video.width,1280);assert.equal(browser.video.height,704);assert.equal(browser.video.readyState,4);
  assert(browser.body.includes('案件已破解'));
  checks.push({name:'formal-video-and-current-game-offline',passed:true});
}
console.log(JSON.stringify(checks,null,2));
