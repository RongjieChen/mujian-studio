import { z } from 'zod';
import type { Case } from './schema.ts';

const citation = z.object({path:z.string().min(1).max(200),quote:z.string().min(4).max(1200)});
export const narrativeSubmission = z.object({
  summary:z.string().min(8).max(1500),
  issues:z.array(z.object({
    kind:z.enum(['contradiction','disclosure','missing_support']),
    severity:z.enum(['concern','question']),
    explanation:z.string().min(10).max(1500),
    suggestion:z.string().min(5).max(1000),
    citations:z.array(citation).min(1).max(4),
  })).max(12),
});
export type NarrativeSubmission=z.infer<typeof narrativeSubmission>;
export type NarrativeReview=NarrativeSubmission & {caseHash:string;revision:number;checkedAt:string;model:string;provider:string};

// Literal source quotations are checked independently of the reviewing model.
// This verifies provenance only; it does not prove the model's interpretation.
export function narrativeSources(doc:Case):Record<string,string> {
  const result:Record<string,string>=Object.create(null);
  function visit(value:unknown,pointer:string){
    if(typeof value==='string')result[pointer]=value;
    else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))visit(child,`${pointer}/${key.replace(/~/g,'~0').replace(/\//g,'~1')}`);
  }
  visit(doc,'');return result;
}
export function validateNarrativeSubmission(doc:Case,input:unknown):NarrativeSubmission {
  const review=narrativeSubmission.parse(input),sources=narrativeSources(doc);
  for(const issue of review.issues){
    for(const source of issue.citations)if(!Object.hasOwn(sources,source.path)||!sources[source.path].includes(source.quote))throw new Error(`原文引用无法核对：${source.path}。请逐字引用 read_case_sources 返回的内容。`);
    if(issue.kind==='contradiction'&&new Set(issue.citations.map(c=>c.path)).size<2)throw new Error('矛盾判断必须引用至少两个不同原文字段。');
  }
  return review;
}
