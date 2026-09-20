import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/);
const text = z.string().trim().min(1).max(6000);
const refs = z.array(id).max(24).default([]);
export const caseSchema = z.object({
  schemaVersion: z.literal(1),
  title: text.max(100), logline: text.max(500), opening: text.max(2000),
  style: text.max(500),
  truth: z.object({
    culpritId: id, motive: text, method: text,
    requiredEvidenceIds: refs,
    timeline: z.array(z.object({ time: text.max(50), event: text.max(500) })).min(2).max(12),
  }),
  characters: z.array(z.object({
    id, name: text.max(40), role: text.max(100), description: text.max(1000),
    publicKnowledge: text.max(2000), secret: text.max(2000), portraitPrompt: text.max(2000),
    topics: z.array(z.object({
      id, question: text.max(200), answer: text.max(1500), requires: refs, reveals: refs,
    })).min(1).max(10),
  })).min(2).max(5),
  scenes: z.array(z.object({
    id, name: text.max(80), description: text.max(1500),
    requires: refs, characterIds: refs,
    imagePrompt: text.max(2000), videoPrompt: text.max(2000),
  })).min(2).max(6),
  clues: z.array(z.object({
    id, name: text.max(100), description: text.max(1500),
    sceneId: id.nullable(), requires: refs,
  })).min(3).max(18),
  endings: z.array(z.object({
    id, kind: z.enum(['solved', 'wrong']), title: text.max(100), text: text.max(2000),
  })).length(2),
});
export type Case = z.infer<typeof caseSchema>;
export type Action = { type: 'travel'; sceneId: string } | { type: 'collect'; clueId: string } | { type: 'ask'; characterId: string; topicId: string } | { type: 'accuse'; characterId: string; evidenceIds: string[] };
export type GameState = { sceneId: string; inventory: string[]; asked: string[]; ending: string | null; history: { action: Action; text: string }[] };
export type Issue = { code: string; severity: 'error' | 'warning'; path: string; message: string; relatedIds: string[] };
export type Report = { rulesVersion:number; passed: boolean; issues: Issue[]; reachableClues: string[]; reachableScenes: string[]; winningPath: Action[]; actionCount: number; checkedAt: string; caseHash: string };
export type Asset = { id: string; sceneId: string; kind: 'image' | 'video'; file: string; mime: string; inputHash: string; seed: number; model: string; durationMs: number; createdAt: string; provenance: 'local-generation' | 'upload'; metadata?: Record<string, unknown> };
export type Revision = { id: string; number: number; createdAt: string; note: string; case: Case; hash: string };
export type Project = { id: string; title: string; brief: string; createdAt: string; updatedAt: string; revision: number; case: Case; revisions: Revision[]; assets: Asset[]; report: Report | null; source: 'sample' | 'generated' | 'imported' };
export type Event = { at: string; type: string; message: string; detail?: unknown };
export type Job = { id: string; projectId: string | null; kind: 'generate' | 'edit' | 'repair' | 'image' | 'video'; state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'; request: Record<string, unknown>; events: Event[]; result?: unknown; error?: string; createdAt: string; startedAt?: string; finishedAt?: string; baseRevision?: number };
