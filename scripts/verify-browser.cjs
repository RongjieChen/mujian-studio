const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');
const path=require('path');
const out=path.resolve(process.env.OUTPUT_DIR||'evidence/release-2026-09-27');fs.mkdirSync(out,{recursive:true});
const base=process.env.APP_URL||'http://127.0.0.1:4317';
const existing=process.env.PROJECT_ID;const prefix=existing?'fresh':'ui';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let p;
 if(!existing){
 p=await(await context.request.post(base+'/api/projects/sample',{data:{}})).json();p.case.title='界面验收专用 '+p.id.slice(0,8);
 await context.request.put(`${base}/api/projects/${p.id}/case`,{data:{case:p.case,baseRevision:1,note:'浏览器验收副本'}});
 await page.goto(base+'/');await page.getByRole('button',{name:new RegExp(p.case.title)}).click();
 await page.getByRole('button',{name:'剧本与证据',exact:true}).click();
 await page.getByRole('button',{name:'作者真相',exact:true}).click();
 await page.getByLabel('开场',{exact:true}).fill('未保存的草稿，导航时必须保留。');
 await page.getByRole('button',{name:'检查与修复',exact:true}).click();
 if(!(await page.getByLabel('开场',{exact:true}).isVisible()))throw new Error('Unsaved editor navigation lost draft');
 await page.getByRole('button',{name:'试玩',exact:true}).click();
 if(await page.getByLabel('开场',{exact:true}).inputValue()!=='未保存的草稿，导航时必须保留。')throw new Error('Preview lost draft');
 await page.getByRole('button',{name:'放弃修改',exact:true}).click();
 await page.getByRole('button',{name:'JSON',exact:true}).click();
 const raw=await page.getByRole('textbox',{name:'案件 JSON'}).inputValue();const edited=JSON.parse(raw);edited.title+=' JSON未保存';
 await page.getByRole('textbox',{name:'案件 JSON'}).fill(JSON.stringify(edited));
 await page.getByRole('button',{name:'作者真相',exact:true}).click();
 if(await page.getByLabel('作品名',{exact:true}).inputValue()!==edited.title)throw new Error('JSON draft lost across tabs');
 await page.getByRole('button',{name:'JSON',exact:true}).click();
 await page.getByRole('textbox',{name:'案件 JSON'}).fill('{bad');
 await page.getByRole('button',{name:'场景',exact:true}).click();
 if(!(await page.getByRole('textbox',{name:'案件 JSON'}).isVisible()))throw new Error('Invalid JSON should remain editable');
 await page.getByRole('textbox',{name:'案件 JSON'}).fill(raw);
 await page.getByRole('button',{name:'场景',exact:true}).click();
 await page.getByRole('button',{name:'作者真相',exact:true}).click();
 await page.getByLabel('开场',{exact:true}).fill('浏览器保存与恢复验收：雨声渐停，调查仍将继续。');
 await page.getByRole('button',{name:'保存修改',exact:true}).click();
 await page.getByText('新版本已保存，检查结果已更新。',{exact:true}).waitFor();
 const saved=await(await context.request.get(`${base}/api/projects/${p.id}`)).json();
 if(saved.revision!==3||!saved.case.opening.startsWith('浏览器保存与恢复验收'))throw new Error('Editor did not save new revision');
 await page.getByRole('button',{name:'版本记录',exact:true}).click();
 await page.locator('.history-list article').filter({hasText:'浏览器验收副本'}).getByRole('button',{name:'恢复此版',exact:true}).click();
 await page.getByText('已恢复第 2 版的内容。',{exact:true}).waitFor();
 const restored=await(await context.request.get(`${base}/api/projects/${p.id}`)).json();
 if(restored.revision!==4||JSON.stringify(restored.case)!==JSON.stringify(p.case))throw new Error('Restore did not create a preserved-history revision');
 await page.getByRole('button',{name:'检查与修复',exact:true}).click();await page.getByRole('button',{name:'开始叙事初审',exact:true}).waitFor();
 if(await page.getByRole('button',{name:'关闭提示',exact:true}).isVisible())await page.getByRole('button',{name:'关闭提示',exact:true}).click();
 await page.screenshot({path:out+'/checks-ui.png',fullPage:true});
 }else{p=await(await context.request.get(`${base}/api/projects/${existing}`)).json();}
 const exported=await context.request.get(`${base}/api/projects/${p.id}/export`);if(exported.status()!==200)throw new Error('Export failed');
 fs.writeFileSync(out+'/'+prefix+'-offline-player.html',await exported.body());
 const project=await(await context.request.get(`${base}/api/projects/${p.id}`)).json();
 await context.setOffline(true);const externalRequests=[];page.on('request',request=>{if(/^https?:/.test(request.url()))externalRequests.push(request.url());});
 await page.goto('file://'+out+'/'+prefix+'-offline-player.html');
 let video=null;
 if(existing){await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=4&&v.videoWidth>0;},{},{timeout:30000});video=await page.locator('video').first().evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,readyState:v.readyState,source:v.currentSrc.slice(0,30)}));}
 await page.screenshot({path:out+'/'+prefix+'-start.png',fullPage:true});
 for(const a of project.report.winningPath){
   const doc=project.case;
   if(a.type==='travel')await page.locator('.travel > button').filter({hasText:doc.scenes.find(s=>s.id===a.sceneId).name}).click();
   if(a.type==='collect')await page.locator('.clue-buttons button').filter({hasText:doc.clues.find(c=>c.id===a.clueId).name}).click();
   if(a.type==='ask'){
     const c=doc.characters.find(c=>c.id===a.characterId);await page.locator('.cast-buttons button').filter({hasText:c.name}).click();
     await page.locator('.topic-list button').filter({hasText:c.topics.find(t=>t.id===a.topicId).question}).click();
   }
   if(a.type==='accuse'){
     await page.getByRole('button',{name:'提出结案',exact:true}).click();
     await page.locator('.suspect-options').getByRole('button',{name:doc.characters.find(c=>c.id===a.characterId).name,exact:true}).click();
     for(const id of a.evidenceIds)await page.locator('.evidence-option').filter({has:page.getByText(doc.clues.find(c=>c.id===id).name,{exact:true})}).locator('input').check();
     await page.getByRole('button',{name:'确认指认并结案',exact:true}).click();
   }
 }
 if(!(await page.locator('body').innerText()).includes('案件已破解'))throw new Error('Offline replay did not solve');
 fs.writeFileSync(out+'/'+prefix+'-browser.json',JSON.stringify({projectId:p.id,offline:true,externalRequests,video,replaySteps:project.report.winningPath.length,errors,body:await page.locator('body').innerText()},null,2));
 if(externalRequests.length||errors.length)throw new Error('Offline player has external requests or page errors');
 await page.screenshot({path:out+'/'+prefix+'-solved.png',fullPage:true});
 await browser.close();console.log(JSON.stringify({projectId:p.id,errors,externalRequests,video}));
})().catch(e=>{console.error(e);process.exit(1)});
