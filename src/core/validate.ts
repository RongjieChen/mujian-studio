import { createHash } from 'node:crypto';
import type { Action, Case, Issue, Report } from './schema.ts';
import { initialState, reduceGame, hasAll } from './game.ts';

export const hashObject = (value: unknown) => createHash('sha256').update(JSON.stringify(value) ?? 'undefined').digest('hex');
export function validateCase(doc: Case): Report {
  const issues: Issue[] = [];
  const add = (code: string, path: string, message: string, relatedIds: string[] = [], severity: 'error' | 'warning' = 'error') => issues.push({ code, path, message, relatedIds, severity });
  const clueIds = new Set(doc.clues.map(c => c.id));
  const sceneIds = new Set(doc.scenes.map(s => s.id));
  const charIds = new Set(doc.characters.map(c => c.id));
  for (const key of ['characters', 'scenes', 'clues', 'endings'] as const) {
    const seen = new Set<string>();
    for (const obj of doc[key]) { if (seen.has(obj.id)) add('DUPLICATE_ID', key, `标识 ${obj.id} 重复。`, [obj.id]); seen.add(obj.id); }
  }
  const checkRefs = (ids: string[], valid: Set<string>, path: string) => {
    for (const id of ids) if (!valid.has(id)) add('MISSING_REFERENCE', path, `引用 ${id} 不存在。`, [id]);
    if (ids.length !== new Set(ids).size) add('DUPLICATE_REFERENCE', path, '同一条件重复出现。');
  };
  checkRefs([doc.truth.culpritId], charIds, 'truth.culpritId');
  checkRefs(doc.truth.requiredEvidenceIds, clueIds, 'truth.requiredEvidenceIds');
  if (doc.truth.requiredEvidenceIds.length < 2) add('WEAK_SOLUTION', 'truth.requiredEvidenceIds', '至少需要两条独立证据才能结案。');
  if (new Set(doc.endings.map(e => e.kind)).size !== 2) add('ENDING_TYPES', 'endings', '需要正确结案与错误结案两种结局。');
  if (!doc.scenes.some(s => !s.requires.length)) add('NO_ENTRY', 'scenes', '没有可从空背包进入的初始场景。');
  for (const scene of doc.scenes) { checkRefs(scene.requires, clueIds, `scenes.${scene.id}.requires`); checkRefs(scene.characterIds, charIds, `scenes.${scene.id}.characterIds`); }
  const revealed = new Set<string>();
  for (const char of doc.characters) {
    const seen = new Set<string>();
    if (!doc.scenes.some(s => s.characterIds.includes(char.id))) add('UNPLACED_CHARACTER', `characters.${char.id}`, `${char.name}未出现在任何场景。`, [char.id]);
    for (const topic of char.topics) {
      if (seen.has(topic.id)) add('DUPLICATE_TOPIC', `characters.${char.id}.topics`, '同一人物的话题标识重复。', [topic.id]); seen.add(topic.id);
      checkRefs(topic.requires, clueIds, `topics.${topic.id}.requires`); checkRefs(topic.reveals, clueIds, `topics.${topic.id}.reveals`);
      for (const id of topic.reveals) {
        revealed.add(id);
        const clue = doc.clues.find(c => c.id === id);
        if (clue?.sceneId) add('CLUE_SOURCE_CONFLICT', `topics.${topic.id}`, `证据 ${id} 同时被配置为现场物证和问话证词。`, [id]);
        if (clue && !hasAll(topic.requires, clue.requires)) add('TOPIC_GUARD_MISMATCH', `characters.${char.id}.topics.${topic.id}.requires`, `问话条件缺少证词 ${id} 的前置物证：${clue.requires.filter(r=>!topic.requires.includes(r)).join(', ')}。不要把证词 ${id} 本身加进条件。`, [id,...clue.requires]);
      }
    }
  }
  for (const clue of doc.clues) {
    checkRefs(clue.requires, clueIds, `clues.${clue.id}.requires`);
    if (clue.sceneId) checkRefs([clue.sceneId], sceneIds, `clues.${clue.id}.sceneId`);
    else if (!revealed.has(clue.id)) add('NO_CLUE_SOURCE', `clues.${clue.id}`, `证词「${clue.name}」没有对应问话来源。`, [clue.id]);
  }
  const path: Action[] = [];
  let state = initialState(doc);
  const reachableScenes = new Set<string>();
  if (!issues.some(i => i.severity === 'error')) {
    // Conditions only add evidence and require positive evidence. A least fixed point is
    // complete for this DSL: collecting one clue can never invalidate another action.
    const apply = (action: Action) => { state = reduceGame(doc, state, action); path.push(action); };
    for (let round = 0; round <= doc.clues.length; round++) {
      const before = state.inventory.length;
      for (const scene of doc.scenes) {
        if (!hasAll(state.inventory, scene.requires)) continue;
        reachableScenes.add(scene.id);
        if (state.sceneId !== scene.id) apply({ type: 'travel', sceneId: scene.id });
        for (const clue of doc.clues) {
          if (clue.sceneId === scene.id && !state.inventory.includes(clue.id) && hasAll(state.inventory, clue.requires)) apply({ type: 'collect', clueId: clue.id });
        }
        for (const cid of scene.characterIds) {
          const char = doc.characters.find(c => c.id === cid)!;
          for (const topic of char.topics) {
            if (topic.reveals.some(id => !state.inventory.includes(id)) && hasAll(state.inventory, topic.requires)) apply({ type: 'ask', characterId: cid, topicId: topic.id });
          }
        }
      }
      if (state.inventory.length === before) break;
    }
    for (const clue of doc.clues) if (!state.inventory.includes(clue.id)) add('UNREACHABLE_CLUE', `clues.${clue.id}`, `证据「${clue.name}」不可达，检查场景开放和证据之间的循环依赖。`, [clue.id, ...(clue.sceneId ? [clue.sceneId] : []), ...clue.requires]);
    for (const scene of doc.scenes) if (!reachableScenes.has(scene.id)) add('UNREACHABLE_SCENE', `scenes.${scene.id}`, `场景「${scene.name}」不可达。`, [scene.id, ...scene.requires]);
    if (hasAll(state.inventory, doc.truth.requiredEvidenceIds)) apply({ type: 'accuse', characterId: doc.truth.culpritId, evidenceIds: [...doc.truth.requiredEvidenceIds] });
    else add('NO_WINNING_PATH', 'truth.requiredEvidenceIds', '玩家无法获得结案所需的完整证据链。', doc.truth.requiredEvidenceIds.filter(id => !state.inventory.includes(id)));
  }
  if (doc.characters.some(c => c.topics.some(t => !t.requires.length && t.reveals.some(id => doc.truth.requiredEvidenceIds.includes(id))))) add('EARLY_EVIDENCE', 'characters', '部分关键证词开场即可获得，请人工确认推理节奏。', [], 'warning');
  return { passed: !issues.some(i => i.severity === 'error'), issues, reachableClues: state.inventory, reachableScenes: [...reachableScenes], winningPath: state.ending ? path : [], actionCount: path.length, checkedAt: new Date().toISOString(), caseHash: hashObject(doc) };
}

export function sceneInput(doc: Case, sceneId: string, kind: 'image' | 'video', seed: number, referenceHash?: string) {
  const scene = doc.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error('场景不存在');
  return { recipe: kind === 'image' ? 'sdxl-v1' : 'wan22-5b-v1', kind, seed, style: doc.style, prompt: kind === 'image' ? scene.imagePrompt : scene.videoPrompt, characters: doc.characters.filter(c => scene.characterIds.includes(c.id)).map(c => ({ id: c.id, description: c.description, portraitPrompt: c.portraitPrompt })), referenceHash: referenceHash ?? null };
}
export function revisionDiff(before: Case, after: Case) {
  const changes: { section: string; id: string; label: string; kind: 'added' | 'removed' | 'changed' }[] = [];
  for (const section of ['characters', 'scenes', 'clues', 'endings'] as const) {
    const a = new Map(before[section].map(x => [x.id, x] as const));
    const b = new Map(after[section].map(x => [x.id, x] as const));
    for (const id of new Set([...a.keys(), ...b.keys()])) if (hashObject(a.get(id)) !== hashObject(b.get(id))) {
      const v = b.get(id) ?? a.get(id)!;
      changes.push({ section, id, label: 'name' in v ? v.name : v.title, kind: !a.has(id) ? 'added' : !b.has(id) ? 'removed' : 'changed' });
    }
  }
  for (const section of ['truth', 'title', 'logline', 'opening', 'style'] as const) if (hashObject(before[section]) !== hashObject(after[section])) changes.push({ section, id: section, label: section, kind: 'changed' });
  const affectedScenes = after.scenes.filter(s => !before.scenes.some(b => b.id === s.id) || hashObject(sceneInput(before, s.id, 'image', 42)) !== hashObject(sceneInput(after, s.id, 'image', 42)) || hashObject(sceneInput(before, s.id, 'video', 42)) !== hashObject(sceneInput(after, s.id, 'video', 42))).map(s => s.id);
  return { changes, affectedScenes };
}
