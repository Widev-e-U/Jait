import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { suiteSchema, verifyTask } from "./agent-eval.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const solutions: Record<string, Record<string, string>> = {
  "read-and-report": { "result.json": '{"service":"fixture-web","port":8087}' },
  "discover-file-tool": { "result.json": '{"bytes":17}' },
  "recover-missing-file": { "result.txt": "recovered from fixture\n" },
  "patch-and-verify": { "math.mjs": "export function sumPositive(values) { return values.filter(v=>v>0).reduce((a,b)=>a+b,0); }" },
  "search-live-config": { "result.json": '{"service":"fixture-api","port":8093}' },
  "preserve-exact-bytes": { "result.txt": "Grüße 🌍\r\n\tvalue = 7  \r\n\r\n" },
  "merge-config": { "merge.mjs": `export function mergeConfig(base, override) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!object(base) || !object(override)) return structuredClone(override);
    const result = structuredClone(base);
    for (const [k,v] of Object.entries(override)) result[k] = k in base ? mergeConfig(base[k],v) : structuredClone(v);
    return result;
  }` },
  "repair-pagination": {
    "pagination.mjs": `export function paginate(rows,{offset=0,limit=2}={}) {
      if (!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<0) throw new RangeError('bounds');
      return rows.slice(offset,offset+limit);
    }`,
    "service.mjs": `import {paginate} from './pagination.mjs'; export function listServices(records,options={}) {
      const rows=records.filter(r=>options.status===undefined||r.status===options.status).sort((a,b)=>a.id-b.id);
      return {items:paginate(rows,options),total:rows.length};
    }`,
  },
  "bounded-async-map": { "queue.mjs": `export async function mapConcurrent(items, concurrency, worker) {
    if (!Number.isInteger(concurrency)||concurrency<1) throw new RangeError('concurrency');
    let next=0, failed=false; const results=new Array(items.length);
    await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
      while(!failed && next<items.length) { const index=next++;
        try {results[index]=await worker(items[index],index);} catch(error) {failed=true;throw error;}
      }
    })); return results;
  }` },
  "inventory-pipeline": {
    "normalize.mjs": `export function normalize(v) { return v && typeof v.host==='string' && Number.isInteger(v.port) && v.port>=1 && v.port<=65535 ? {host:v.host,port:v.port} : null; }`,
    "report.mjs": `import {normalize} from './normalize.mjs'; export function report(lines,scope) {
      const counts={invalid:0,excluded:0,duplicates:0}, endpoints=[], seen=new Set();
      for(const line of lines) {if(!line.trim())continue;let item;
        try {item=normalize(JSON.parse(line));} catch {counts.invalid++;continue;}
        if(!item){counts.invalid++;continue;}
        if(!scope.targets.includes(item.host)||scope.exclusions.includes(item.host)){counts.excluded++;continue;}
        const key=JSON.stringify([item.host,item.port]);if(seen.has(key)){counts.duplicates++;continue;}
        seen.add(key);endpoints.push(item);
      }
      endpoints.sort((a,b)=>a.host<b.host?-1:a.host>b.host?1:a.port-b.port);
      return {endpoints,counts};
    }`,
    "result.json": '{"endpoints":[{"host":"fixture-a","port":80},{"host":"fixture-a","port":8080},{"host":"fixture-b","port":443}],"counts":{"invalid":4,"excluded":2,"duplicates":1}}',
  },
};
it("defines ten verifiable tasks whose broken baseline fails and correct artifacts pass", async () => {
  const suite = suiteSchema.parse(JSON.parse(await readFile(new URL("../../../../evaluations/basic.json", import.meta.url), "utf8")));
  expect(suite.tasks).toHaveLength(10);
  expect(suite.tasks.map(t=>t.id)).toEqual(Object.keys(solutions));
  for (const task of suite.tasks) {
    const root = await mkdtemp(path.join(tmpdir(), "jait-suite-")); roots.push(root);
    for (const [name,content] of Object.entries(task.fixtures)) {
      const target=path.join(root,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,content);
    }
    expect((await verifyTask(task,root)).some(c=>!c.passed), task.id+" broken baseline").toBe(true);
    for (const [name,content] of Object.entries(solutions[task.id]!)) await writeFile(path.join(root,name),content);
    const checks=await verifyTask(task,root);
    expect(checks.every(c=>c.passed), task.id+JSON.stringify(checks)).toBe(true);
  }
});
