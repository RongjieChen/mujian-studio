import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Case, Project, Job } from '../core/schema.ts';
import { hashObject, revisionDiff, validateCase } from '../core/validate.ts';

export const dataDir = path.resolve(process.env.DATA_DIR || './data');
for (const dir of ['', 'projects', 'jobs', 'media', 'runtime']) fs.mkdirSync(path.join(dataDir, dir), { recursive: true });
function filename(kind: string, id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('无效标识');
  return path.join(dataDir, kind, `${id}.json`);
}
export function atomicWrite(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
export function getProject(id: string): Project {
  const file = filename('projects', id);
  if (!fs.existsSync(file)) throw new Error('项目不存在');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function listProjects(): Project[] {
  return fs.readdirSync(path.join(dataDir, 'projects')).filter(n => n.endsWith('.json')).map(n => JSON.parse(fs.readFileSync(path.join(dataDir, 'projects', n), 'utf8'))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export const saveProject = (project: Project) => atomicWrite(filename('projects', project.id), project);
export function createProject(doc: Case, brief: string, source: Project['source']): Project {
  const now = new Date().toISOString();
  const project: Project = { id: randomUUID(), title: doc.title, brief, createdAt: now, updatedAt: now, revision: 1, case: doc, revisions: [{ id: randomUUID(), number: 1, createdAt: now, note: source === 'sample' ? '载入手工编写的示例案件' : '创建案件', case: doc, hash: hashObject(doc) }], assets: [], report: validateCase(doc), source };
  saveProject(project); return project;
}
export function updateCase(id: string, doc: Case, baseRevision: number, note: string) {
  const project = getProject(id);
  if (project.revision !== baseRevision) throw new Error('项目已被另一项操作修改，请刷新后重试，旧版本没有被覆盖。');
  const diff = revisionDiff(project.case, doc);
  if (!diff.changes.length) return { project, diff };
  project.revision++; project.case = doc; project.title = doc.title; project.updatedAt = new Date().toISOString();
  project.revisions.push({ id: randomUUID(), number: project.revision, createdAt: project.updatedAt, note, case: doc, hash: hashObject(doc) });
  project.report = validateCase(doc); saveProject(project);
  return { project, diff };
}
export const saveJob = (job: Job) => atomicWrite(filename('jobs', job.id), job);
export function getJob(id: string): Job { return JSON.parse(fs.readFileSync(filename('jobs', id), 'utf8')); }
export function listJobs(): Job[] {
  return fs.readdirSync(path.join(dataDir, 'jobs')).filter(n => n.endsWith('.json')).map(n => JSON.parse(fs.readFileSync(path.join(dataDir, 'jobs', n), 'utf8'))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
