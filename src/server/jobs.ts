import { randomUUID } from 'node:crypto';
import type { Job } from '../core/schema.ts';
import { listJobs, saveJob } from './store.ts';

type Handler = (job: Job, emit: (type: string, message: string, detail?: unknown) => void, signal: AbortSignal) => Promise<unknown>;
const handlers: Partial<Record<Job['kind'], Handler>> = {};
const queue: Job[] = [];
let active: { job: Job; controller: AbortController } | null = null;
export function registerHandler(kind: Job['kind'], handler: Handler) { handlers[kind] = handler; }
export function recoverJobs() {
  for (const job of listJobs()) if (job.state === 'running' || job.state === 'queued') {
    job.state = 'interrupted'; job.error = '服务重启中断了任务。已有项目版本和素材已保留，可重新发起任务。'; job.finishedAt = new Date().toISOString(); saveJob(job);
  }
}
export function enqueue(kind: Job['kind'], request: Job['request'], projectId: string | null, baseRevision?: number) {
  if (queue.length > 12) throw new Error('当前排队任务较多，请稍后重试。');
  const job: Job = { id: randomUUID(), projectId, kind, state: 'queued', request, baseRevision, events: [], createdAt: new Date().toISOString() };
  saveJob(job); queue.push(job); void pump(); return job;
}
export function cancelJob(id: string) {
  if (active?.job.id === id) { active.controller.abort(new Error('用户取消')); return; }
  const index = queue.findIndex(j => j.id === id);
  if (index < 0) throw new Error('任务已经结束或不在当前队列中。');
  const [job] = queue.splice(index, 1); job.state = 'cancelled'; job.finishedAt = new Date().toISOString(); saveJob(job);
}
async function pump() {
  if (active || !queue.length) return;
  const job = queue.shift()!; const controller = new AbortController(); active = { job, controller };
  job.state = 'running'; job.startedAt = new Date().toISOString(); saveJob(job);
  const emit = (type: string, message: string, detail?: unknown) => { job.events.push({ at: new Date().toISOString(), type, message, detail }); if (job.events.length > 250) job.events.shift(); saveJob(job); };
  const timer = setTimeout(() => controller.abort(new Error('任务超过时限，已有版本和素材已保留。')), job.kind === 'video' ? 45 * 60_000 : 15 * 60_000);
  try {
    const handler = handlers[job.kind]; if (!handler) throw new Error('任务处理器未配置。');
    job.result = await handler(job, emit, controller.signal);
    if (controller.signal.aborted) throw controller.signal.reason;
    job.state = 'succeeded';
  } catch (error) {
    job.state = controller.signal.aborted ? 'cancelled' : 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    emit('error', job.error);
  } finally { clearTimeout(timer); job.finishedAt = new Date().toISOString(); saveJob(job); active = null; void pump(); }
}
