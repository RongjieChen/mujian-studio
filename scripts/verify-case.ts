import fs from 'node:fs';
import { caseSchema } from '../src/core/schema.ts';
import { validateCase } from '../src/core/validate.ts';
import { initialState, reduceGame } from '../src/core/game.ts';

const filename=process.argv[2];
if(!filename)throw new Error('Usage: npx tsx scripts/verify-case.ts case-or-project.json');
const input=JSON.parse(fs.readFileSync(filename,'utf8'));
const doc=caseSchema.parse(input.case??input);
const report=validateCase(doc);
const state=report.winningPath.reduce((s,a)=>reduceGame(doc,s,a),initialState(doc));
const solved=doc.endings.find(e=>e.kind==='solved')?.id===state.ending;
console.log(JSON.stringify({title:doc.title,structuralPass:report.passed,replaySolved:solved,evidenceReached:state.inventory.length,steps:report.winningPath.length,caseHash:report.caseHash,issues:report.issues},null,2));
if(!report.passed||!solved)process.exitCode=1;
