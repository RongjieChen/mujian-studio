import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../core/schema.ts';
import { validateCase } from '../core/validate.ts';
import { assetCurrent } from './media.ts';
import { dataDir } from './store.ts';

export function exportGame(project: Project) {
  const report=validateCase(project.case);
  if(!report.passed)throw new Error('案件仍有规则错误，修复并检查通过后才能导出。');
  const jsPath=path.resolve('dist/player-runtime.js'),cssPath=path.resolve('dist/player-runtime.css');
  if(!fs.existsSync(jsPath))throw new Error('独立播放器尚未构建，请先运行 npm run build。');
  const media:Record<string,{image?:string;video?:string}>={};
  for(const asset of project.assets){
    if(!assetCurrent(project,asset))continue;
    const file=path.join(dataDir,'media',asset.file);
    if(!fs.existsSync(file))throw new Error(`素材 ${asset.id} 的文件缺失，导出已阻止。`);
    const size=fs.statSync(file).size;if(size>80*1024*1024)throw new Error('单文件导出暂不支持超过 80 MB 的单个素材。');
    (media[asset.sceneId]??={})[asset.kind]=`data:${asset.mime};base64,${fs.readFileSync(file).toString('base64')}`;
  }
  const data=JSON.stringify({case:project.case,media,revision:project.revision}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const title=project.title.replace(/[<>&"']/g,c=>`&#${c.charCodeAt(0)};`);
  const js=fs.readFileSync(jsPath,'utf8').replace(/<\/script/gi,'<\\/script');
  const css=fs.existsSync(cssPath)?fs.readFileSync(cssPath,'utf8'):'';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 幕间</title><style>${css}</style></head><body><div id="root"></div><script type="application/json" id="game-data">${data}</script><script>${js}</script></body></html>`;
}
