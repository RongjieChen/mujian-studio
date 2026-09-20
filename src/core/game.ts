import type { Action, Case, GameState } from './schema.ts';

export const hasAll = (inventory: string[], required: string[]) => required.every(id => inventory.includes(id));
export function initialState(doc: Case): GameState {
  return { sceneId: doc.scenes.find(s => !s.requires.length)?.id ?? '', inventory: [], asked: [], ending: null, history: [] };
}
export function availableTopics(doc: Case, state: GameState, characterId: string) {
  const scene = doc.scenes.find(s => s.id === state.sceneId);
  if (!scene?.characterIds.includes(characterId)) return [];
  return doc.characters.find(c => c.id === characterId)?.topics.filter(t => hasAll(state.inventory, t.requires)) ?? [];
}
export function reduceGame(doc: Case, state: GameState, action: Action): GameState {
  if (state.ending) throw new Error('本轮案件已结束，请重新开始。');
  const next = structuredClone(state);
  let result = '';
  if (action.type === 'travel') {
    const scene = doc.scenes.find(s => s.id === action.sceneId);
    if (!scene || !hasAll(state.inventory, scene.requires)) throw new Error('尚未满足场景开放条件。');
    next.sceneId = scene.id; result = scene.description;
  } else if (action.type === 'collect') {
    const clue = doc.clues.find(c => c.id === action.clueId);
    if (!clue || clue.sceneId !== state.sceneId || !hasAll(state.inventory, clue.requires)) throw new Error('当前无法取得这条证据。');
    if (state.inventory.includes(clue.id)) throw new Error('已收集这条证据。');
    next.inventory.push(clue.id); result = `${clue.name}：${clue.description}`;
  } else if (action.type === 'ask') {
    const topic = availableTopics(doc, state, action.characterId).find(t => t.id === action.topicId);
    if (!topic) throw new Error('当前无法提出这个问题。');
    for (const id of topic.reveals) {
      const clue = doc.clues.find(c => c.id === id);
      if (!clue || clue.sceneId !== null || !hasAll(state.inventory, clue.requires)) throw new Error('证词的解锁规则不完整，请创作者检查。');
      if (!next.inventory.includes(id)) next.inventory.push(id);
    }
    const key = `${action.characterId}:${topic.id}`;
    if (!next.asked.includes(key)) next.asked.push(key);
    result = topic.answer;
  } else {
    if (!doc.characters.some(c => c.id === action.characterId)) throw new Error('嫌疑人不存在。');
    if (!hasAll(state.inventory, action.evidenceIds)) throw new Error('只能提交已经获得的证据。');
    const solved = action.characterId === doc.truth.culpritId && hasAll(action.evidenceIds, doc.truth.requiredEvidenceIds);
    const ending = doc.endings.find(e => e.kind === (solved ? 'solved' : 'wrong'));
    if (!ending) throw new Error('缺少结局。');
    next.ending = ending.id; result = ending.text;
  }
  next.history.push({ action, text: result });
  return next;
}
