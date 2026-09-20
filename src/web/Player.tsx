import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, MapPin, MessageCircle, RotateCcw, Search, X, FileText, Scale } from 'lucide-react';
import type { Action, Case, GameState } from '../core/schema.ts';
import { availableTopics, hasAll, initialState, reduceGame } from '../core/game.ts';
import { RoomArt } from './RoomArt.tsx';

export type MediaMap=Record<string,{image?:string;video?:string}>;
export function Player({doc,media={},onExit}:{doc:Case;media?:MediaMap;onExit?:()=>void}){
  const [state,setState]=useState<GameState>(()=>initialState(doc));
  const [message,setMessage]=useState(doc.opening);
  const [character,setCharacter]=useState<string|null>(null);
  const [accusing,setAccusing]=useState(false);
  const [suspect,setSuspect]=useState('');
  const [evidence,setEvidence]=useState<string[]>([]);
  const [error,setError]=useState('');
  const [notebook,setNotebook]=useState(false);
  const scene=doc.scenes.find(s=>s.id===state.sceneId);
  const ending=doc.endings.find(e=>e.id===state.ending);
  const topics=useMemo(()=>character?availableTopics(doc,state,character):[],[doc,state,character]);
  function act(action:Action){try{const next=reduceGame(doc,state,action);setState(next);setMessage(next.history.at(-1)!.text);setError('');if(action.type==='travel')setCharacter(null);if(action.type==='accuse')setAccusing(false);}catch(e){setError((e as Error).message);}}
  function reset(){setState(initialState(doc));setMessage(doc.opening);setCharacter(null);setAccusing(false);setEvidence([]);setSuspect('');}
  const currentMedia=scene?media[scene.id]:undefined;
  return <div className="player">
    <div className="player-top"><button className="icon-button" onClick={onExit||reset} aria-label={onExit?'退出试玩':'重新开始'}><ArrowLeft size={18}/></button><div><span className="eyebrow">幕间 · 互动悬疑</span><strong>{doc.title}</strong></div><span className="player-progress">已收集 {state.inventory.length} / {doc.clues.length} 条证据</span><button className="subtle" onClick={reset}><RotateCcw size={14}/>重新开始</button></div>
    <div className="player-stage">
      {currentMedia?.video?<video key={currentMedia.video} src={currentMedia.video} poster={currentMedia.image} autoPlay muted loop playsInline/>:currentMedia?.image?<img src={currentMedia.image} alt={scene?.name}/>:<RoomArt scene={scene?.id}/>}
      <div className="stage-shade"/>
      <span className="scene-location"><MapPin size={14}/>{scene?.name||'场景不可用'}</span>
      {!currentMedia&&<span className="art-label">预制示意插画 · 可在分镜页生成素材</span>}
      <div className="scene-story"><p className="eyebrow">{ending?'终幕':character?doc.characters.find(c=>c.id===character)?.name:'调查档案'}</p><h1>{ending?ending.title:scene?.name}</h1><p>{ending?ending.text:message}</p></div>
    </div>
    {error&&<div role="alert" className="inline-error">{error}</div>}
    {ending?<div className="ending-actions"><button className="primary" onClick={reset}>重新调查</button><span>本轮 {state.history.length} 次操作 · {ending.kind==='solved'?'案件已破解':'还需要更多证据'}</span></div>:<div className="player-controls">
      <div className="investigate"><div className="section-label"><Search size={15}/>调查现场</div><div className="clue-buttons">{doc.clues.filter(c=>c.sceneId===state.sceneId&&hasAll(state.inventory,c.requires)).map(c=><button key={c.id} disabled={state.inventory.includes(c.id)} onClick={()=>act({type:'collect',clueId:c.id})}>{state.inventory.includes(c.id)?<Check size={16}/>:<FileText size={16}/>}<span>{c.name}</span><ChevronRight size={14}/></button>)}</div>
      <div className="section-label"><MessageCircle size={15}/>与在场的人交谈</div><div className="cast-buttons">{scene?.characterIds.map(id=>{const c=doc.characters.find(c=>c.id===id);return c&&<button className={id===character?'selected':''} key={id} onClick={()=>{setCharacter(id);setMessage(c.publicKnowledge);}}><span className="avatar">{c.name.slice(-2)}</span><span>{c.name}<small>{c.role}</small></span></button>;})}</div>
      {character&&<div className="topic-list">{topics.map(t=><button key={t.id} onClick={()=>act({type:'ask',characterId:character,topicId:t.id})}>{state.asked.includes(`${character}:${t.id}`)&&<Check size={13}/>}<span>{t.question}</span>{t.requires.length>0&&<small>出示证据</small>}</button>)}<p className="muted">新的证据可能解锁追问。</p></div>}
      </div>
      <div className="travel"><div className="section-label"><MapPin size={15}/>前往其他场景</div>{doc.scenes.map(s=><button key={s.id} className={s.id===state.sceneId?'selected':''} disabled={!hasAll(state.inventory,s.requires)} onClick={()=>act({type:'travel',sceneId:s.id})}><span>{s.name}</span><small>{!hasAll(state.inventory,s.requires)?'需要先调查':s.id===state.sceneId?'当前位置':'进入'}</small></button>)}<div className="player-tools"><button className="secondary" onClick={()=>setNotebook(true)}>证据笔记 · {state.inventory.length}</button><button className="primary" onClick={()=>setAccusing(true)}><Scale size={15}/>提出结案</button></div></div>
    </div>}
    {(accusing||notebook)&&<div className="modal-backdrop"><div className="modal player-modal"><button className="close-button" onClick={()=>{setAccusing(false);setNotebook(false);}} aria-label="关闭"><X size={20}/></button><span className="eyebrow">{accusing?'把证据连成真相':'调查笔记'}</span><h2>{accusing?'你认为是谁取走了目标物品？':'已收集的证据'}</h2>{accusing&&<div className="suspect-options">{doc.characters.map(c=><button key={c.id} className={suspect===c.id?'selected':''} onClick={()=>setSuspect(c.id)}>{c.name}</button>)}</div>}<p className="muted">{accusing?'选择支撑你的指认的证据。证据不完整也可能导致错误结案。':'证据文字以这里记录的内容为准。'}</p>{state.inventory.length===0&&<p>还没有证据，先调查场景。</p>}{state.inventory.map(id=>{const c=doc.clues.find(c=>c.id===id)!;return <label className="evidence-option" key={id}>{accusing&&<input type="checkbox" checked={evidence.includes(id)} onChange={()=>setEvidence(evidence.includes(id)?evidence.filter(e=>e!==id):[...evidence,id])}/>}<span><strong>{c.name}</strong><p>{c.description}</p></span></label>;})}{accusing&&<button className="primary wide" disabled={!suspect} onClick={()=>act({type:'accuse',characterId:suspect,evidenceIds:evidence})}>确认指认并结案</button>}</div></div>}
  </div>;
}
