import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sampleCase } from '../src/core/sample.ts';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'mujian-tests-'));
const {createProject,updateCase,getProject,dataDir,saveProject}=await import('../src/server/store.ts');
const {exportGame}=await import('../src/server/export.ts');
const {assetCurrent}=await import('../src/server/media.ts');
const {hashObject,sceneInput}=await import('../src/core/validate.ts');

test.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
test('optimistic concurrency rejects outdated edits and preserves revisions',()=>{
  const p=createProject(structuredClone(sampleCase),'test','sample');const doc=structuredClone(p.case);doc.title='新标题';
  const result=updateCase(p.id,doc,1,'edit');assert.equal(result.project.revision,2);
  assert.throws(()=>updateCase(p.id,p.case,1,'late edit'),/已被另一项/);
  assert.equal(getProject(p.id).revisions[0].case.title,'雨停之前');assert.equal(getProject(p.id).title,'新标题');
});
test('unsafe file identifiers cannot escape project storage',()=>{
  assert.throws(()=>getProject('../../other'));
});
test('export rechecks actual data rather than trusting a stale passed report',()=>{
  const p=createProject(structuredClone(sampleCase),'test','sample');p.case.clues[0].requires=[p.case.clues[0].id];
  assert.equal(p.report!.passed,true);assert.throws(()=>exportGame(p),/规则错误/);
});
test('generated images go stale on visual edits and videos follow the current reference',()=>{
  const p=createProject(structuredClone(sampleCase),'test','sample');
  const image={id:'image1',sceneId:'lobby',kind:'image' as const,file:'image1.png',mime:'image/png',inputHash:hashObject(sceneInput(p.case,'lobby','image',42)),seed:42,model:'test',durationMs:1,createdAt:new Date().toISOString(),provenance:'local-generation' as const};
  fs.writeFileSync(path.join(dataDir,'media',image.file),'test-image-one');p.assets.push(image);
  const refHash=hashObject(Buffer.from('test-image-one').toString('base64'));
  const video={...image,id:'video1',kind:'video' as const,file:'video1.mp4',mime:'video/mp4',inputHash:hashObject(sceneInput(p.case,'lobby','video',42,refHash)),metadata:{referenceHash:refHash}};p.assets.push(video);
  assert.equal(assetCurrent(p,image),true);assert.equal(assetCurrent(p,video),true);
  const replacement={...image,id:'image2',file:'image2.png'};fs.writeFileSync(path.join(dataDir,'media',replacement.file),'different-image');p.assets.push(replacement);
  assert.equal(assetCurrent(p,video),false);
  p.case.scenes[0].imagePrompt+=' New lighting.';assert.equal(assetCurrent(p,image),false);
});
test('HTML export escapes user-authored script delimiters and needs no remote URLs',()=>{
  const p=createProject(structuredClone(sampleCase),'test','sample');p.case.title='</script><script>alert(1)</script>';
  if(!fs.existsSync('dist/player-runtime.js'))throw new Error('Run npm run build before persistence tests.');
  const html=exportGame(p);
  assert(!html.includes('</script><script>alert(1)'));
  assert(html.includes('\\u003c/script>'));
  const embedded=html.match(/<script type="application\/json" id="game-data">([\s\S]*?)<\/script>/)![1];
  assert.equal(JSON.parse(embedded).case.title,p.case.title);
  assert(!html.includes('src="https://'));
});
test('export embeds a replacement asset even if an older replaced file is missing',()=>{
  const p=createProject(structuredClone(sampleCase),'test','sample');
  const sceneId=p.case.scenes[0].id;
  const asset={id:'old',sceneId,kind:'image' as const,file:'missing.png',mime:'image/png',inputHash:hashObject(sceneInput(p.case,sceneId,'image',42)),seed:42,model:'fixture',durationMs:1,createdAt:new Date().toISOString(),provenance:'local-generation' as const};
  p.assets.push(asset,{...asset,id:'new',file:'replacement.png'});
  fs.writeFileSync(path.join(dataDir,'media','replacement.png'),'fixture-image');
  assert(exportGame(p).includes(Buffer.from('fixture-image').toString('base64')));
  fs.unlinkSync(path.join(dataDir,'media','replacement.png'));
  assert.throws(()=>exportGame(p),/文件缺失/);
});
test('schema-valid scene ID constructor cannot collide with object prototype in exports',()=>{
  const p=createProject(structuredClone(sampleCase),'test','sample');const old=p.case.scenes[0].id;p.case.scenes[0].id='constructor';
  for(const c of p.case.clues)if(c.sceneId===old)c.sceneId='constructor';
  p.assets.push({id:'constructor-image',sceneId:'constructor',kind:'image',file:'constructor.png',mime:'image/png',inputHash:hashObject(sceneInput(p.case,'constructor','image',0)),seed:0,model:'fixture',durationMs:0,createdAt:new Date().toISOString(),provenance:'upload'});
  fs.writeFileSync(path.join(dataDir,'media','constructor.png'),'constructor fixture');
  const html=exportGame(p),embedded=html.match(/<script type="application\/json" id="game-data">([\s\S]*?)<\/script>/)![1];
  assert(JSON.parse(embedded).media.constructor.image.startsWith('data:image/png'));
});
