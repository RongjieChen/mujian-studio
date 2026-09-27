import type { Case } from './schema.ts';
import { hashObject } from './validate.ts';

// Repair may change the graph, but cannot rewrite the story to make a test pass.
// Editing the story is a separate, explicitly selected operation.
export function repairProtectedContent(doc: Case) {
  return {
    schemaVersion: doc.schemaVersion, title: doc.title, logline: doc.logline,
    opening: doc.opening, style: doc.style, truth: doc.truth, endings: doc.endings,
    scenes: doc.scenes.map(({ requires: _requires, ...scene }) => scene),
    clues: doc.clues.map(({ requires: _requires, sceneId: _sceneId, ...clue }) => clue),
    characters: doc.characters.map(character => ({
      ...character,
      topics: character.topics.map(({ requires: _requires, reveals: _reveals, ...topic }) => topic),
    })),
  };
}

export function assertRepairPreservesStory(before: Case, after: Case) {
  if (hashObject(repairProtectedContent(before)) !== hashObject(repairProtectedContent(after))) {
    throw new Error('修复只能调整场景/证据的前置条件、物证所在场景和问话揭示关系；人物、对白、证据文字、真相、结案要求和实体 ID 必须保持不变。修改故事请使用编辑任务。');
  }
}
