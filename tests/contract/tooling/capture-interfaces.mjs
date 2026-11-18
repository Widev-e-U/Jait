// Read-only TypeScript AST authoring aid. Never imports or executes gateway code.
import ts from '../../../node_modules/typescript/lib/typescript.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const directories = ['packages/gateway/src', 'packages/shared/src', 'packages/gateway/bin', 'packages/gateway/scripts'];
export const extraFiles = ['packages/gateway/package.json', 'packages/shared/package.json'];
export const categories = ['route', 'schema', 'tool', 'ws_event', 'sse_event', 'db_table', 'db_migration', 'config', 'cli', 'dependency', 'bridge', 'asset', 'platform'];
const excluded = new Set(['node_modules', 'dist', 'build', 'web-dist', 'target', '.git']);
export function fingerprint(bytes) {
 let h = 0xcbf29ce484222325n;
 for (const b of Buffer.from(bytes)) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
 return h.toString(16).padStart(16, '0');
}
// The Rust auditor recomputes this digest as serde_json::to_string(&to_value(&claims)),
// which serializes the typed Claim structs in declaration order. Keys must therefore be
// hashed exactly as emitted below: sorting or reordering them desynchronizes every entry.
export const claimKeys = ['id','kind','name','start','end','fingerprint','details','status','required_test_ids','gap'];
export function claimsDigest(claims) {
 return fingerprint(JSON.stringify(claims));
}
export function pathsAt(base) {
 const out = [];
 for (const rel of [...directories,...extraFiles]) {
  let current=base;
  for (const component of rel.split('/')) {
   current=path.join(current,component);
   if(fs.lstatSync(current).isSymbolicLink()) throw new Error(`symlink forbidden: ${rel}`);
  }
 }
 function walk(rel) {
  for (const e of fs.readdirSync(path.join(base, rel), { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
   if (excluded.has(e.name)) continue;
   const p = `${rel}/${e.name}`;
   if (e.isSymbolicLink()) throw new Error(`symlink forbidden: ${p}`);
   if (e.isDirectory()) walk(p);
   else if (e.isFile() && !/\.(test|spec)\.[^.]+$/.test(e.name)) out.push(p);
  }
 }
 directories.forEach(walk);
 return [...out, ...extraFiles].sort();
}
export function canonical(value) {
 if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
 if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
const literal = n => n && (ts.isStringLiteralLike(n) || ts.isNumericLiteral(n)) ? n.text : null;
const key = n => n?.name && (literal(n.name) ?? (ts.isIdentifier(n.name) ? n.name.text : null));
const property = (n, name) => ts.isObjectLiteralExpression(n ?? {}) ? n.properties.find(p=>key(p)===name)?.initializer : undefined;
function owner(p) {
 if (p.includes('/db/')) return 'R07-storage';
 if (p.includes('/routes/')) return 'R04-http';
 if (p.endsWith('/ws.ts') || p.endsWith('/streaming.ts')) return 'R05-streaming';
 if (p.includes('/tools/') || p.includes('/security/')) return 'R06-execution';
 return 'R01-runtime-and-shared';
}
export function scan(source, file) {
 const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
 if (ast.parseDiagnostics.length) throw new Error(`parse diagnostics: ${file}`);
 const claims = [];
 const httpReceivers = new Set(['app','fastify','server']);
 function receivers(n) {
  if (ts.isParameter(n) && n.type?.getText(ast).includes('FastifyInstance') && ts.isIdentifier(n.name)) httpReceivers.add(n.name.text);
  ts.forEachChild(n,receivers);
 }
 receivers(ast);
 function add(kind, name, node, details = {}) {
  const start = Buffer.byteLength(source.slice(0,node.getStart(ast)));
  const end = Buffer.byteLength(source.slice(0,node.end));
  const evidence = Buffer.from(source).subarray(start,end);
  claims.push({ id:`${file}#${kind}:${start}`, kind, name:String(name ?? '<dynamic>'), start, end, fingerprint:fingerprint(evidence), details,
   status:'pending', required_test_ids:[], gap:'AST candidate only; resolve aliases, activation, payload/schema semantics and add exact Rust contract test IDs after review.' });
 }
 function visit(n) {
  if (ts.isCallExpression(n)) {
   const expr=n.expression, method=ts.isPropertyAccessExpression(expr) ? expr.name.text : '', callee=expr.getText(ast);
   const a=n.arguments;
   if (['get','post','put','patch','delete','head','options','all','route'].includes(method) &&
      httpReceivers.has(expr.expression?.getText(ast))) {
    // Receiver spelling/type syntax is a candidate filter, not symbol/activation proof.
    const opts=method==='route' ? a[0] : a[1];
    const url=method==='route' ? property(opts,'url') : a[0];
    const methods=method==='route' ? property(opts,'method')?.getText(ast) ?? '<unresolved>' : method.toUpperCase();
    add('route',literal(url) ?? '<dynamic>',n,{methods,receiver:expr.expression?.getText(ast)??'',url_expression:url?.getText(ast)??'',schema:property(opts,'schema')?.getText(ast)??'<handler validation / unresolved>',resolution:'candidate; receiver identity and plugin prefixes require review'});
   }
   if (method==='register' || /register.*(Routes|Tools)|registerTool/i.test(callee)) add('bridge',callee,n,{registration:'dynamic activation/registration graph unresolved'});
   if (callee==='sqliteTable') add('db_table',literal(a[0]),n,{definition:n.getText(ast)});
   if (/^(spawn|spawnSync|execFile|execFileSync|fork)$/.test(callee) || /\.(spawn|execFile|fork)$/.test(callee)) add('bridge',literal(a[0])??'<dynamic executable>',n,{expression:a[0]?.getText(ast)??''});
   if (/sendEvent|writeSSE|emitSSE|sendSSE/i.test(callee)) add('sse_event',literal(a[0]),n,{expression:a[0]?.getText(ast)??''});
  }
  if (ts.isObjectLiteralExpression(n)) {
   const name=property(n,'name');
   if (name && (property(n,'parameters') || property(n,'inputSchema') || property(n,'execute'))) add('tool',literal(name),n,{name_expression:name.getText(ast),schema:(property(n,'parameters')??property(n,'inputSchema'))?.getText(ast)??'<unresolved>'});
   if (file.endsWith('/db/migrations.ts') && property(n,'id') && name) add('db_migration',literal(name),n,{version:property(n,'id').getText(ast)});
  }
  if (ts.isPropertyAssignment(n) && ['type','event'].includes(key(n)) && (file.includes('/shared/') || /ws|stream|chat/.test(file))) {
   if (literal(n.initializer) || ts.isTemplateExpression(n.initializer)) add(key(n)==='event'?'sse_event':'ws_event',literal(n.initializer),n,{expression:n.initializer.getText(ast),resolution:'event/discriminant candidate; transport unresolved'});
  }
  if (ts.isTypeAliasDeclaration(n) && /Event|Stream|Ws/i.test(n.name.text)) {
   function names(t) { if(ts.isLiteralTypeNode(t) && literal(t.literal)) add(/Ws/i.test(n.name.text)?'ws_event':'sse_event',literal(t.literal),t,{declaration:n.name.text}); else ts.forEachChild(t,names); }
   names(n.type);
  }
  if ((ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) && file.includes('/shared/')) add('schema',n.name.text,n,{representation:'TypeScript contract declaration, not JSON Schema',definition:n.getText(ast)});
  if (ts.isVariableDeclaration(n) && n.initializer && /schema/i.test(n.name.getText(ast))) add('schema',n.name.getText(ast),n,{representation:'schema expression; references unresolved',definition:n.initializer.getText(ast)});
  if (ts.isPropertySignature(n) && ts.isInterfaceDeclaration(n.parent) && n.parent.name.text==='AppConfig') add('config',key(n),n,{type:n.type?.getText(ast)??'<unknown>'});
  if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
   if (n.expression.getText(ast)==='process.env') add('config',ts.isPropertyAccessExpression(n)?n.name.text:literal(n.argumentExpression),n,{resolution:'environment key; dynamic indices pending'});
  }
  if (file.includes('/bin/') && ts.isStringLiteralLike(n)) {
   if (ts.isCaseClause(n.parent) || (ts.isBinaryExpression(n.parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(n.parent.operatorToken.kind) && /command|cmd|arg|argv/i.test(n.parent.getText(ast)))) add('cli',n.text,n,{resolution:'dispatch literal; hierarchy/options pending'});
  }
  if (ts.isStringLiteralLike(n) && ['linux','darwin','win32','android','x64','arm64','arm'].includes(n.text)) add('platform',n.text,n,{resolution:'source branch candidate; support and CI evidence pending'});
  if (ts.isImportDeclaration(n) && literal(n.moduleSpecifier) && !literal(n.moduleSpecifier).startsWith('.')) add('dependency',literal(n.moduleSpecifier),n,{resolution:'static import; runtime/optional/type-only classification pending'});
  ts.forEachChild(n,visit);
 }
 visit(ast);
 return claims.sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
export function capture(base=root) {
 const files=pathsAt(base).map(p=>{
  const bytes=fs.readFileSync(path.join(base,p));
  let claims=[];
  if (/\.(ts|tsx|mjs|cjs|js)$/.test(p)) claims=scan(bytes.toString('utf8'),p);
  // Non-code assets and package metadata remain pinned even if not parsed by TS.
  if (p.endsWith('/package.json')) {
   const pkg=JSON.parse(bytes);
   for (const [name,version] of Object.entries(pkg.dependencies??{})) claims.push({id:`${p}#dependency:${name}`,kind:'dependency',name,start:0,end:bytes.length,fingerprint:fingerprint(bytes),details:{version},status:'pending',required_test_ids:[],gap:'Dependency replacement, native ABI and optional runtime matrix require review.'});
   for (const [name,entry] of Object.entries(pkg.bin??{})) claims.push({id:`${p}#cli:${name}`,kind:'cli',name,start:0,end:bytes.length,fingerprint:fingerprint(bytes),details:{entry},status:'pending',required_test_ids:[],gap:'CLI behavior and platform fixture evidence required.'});
  }
  if (!/\.(ts|tsx|mjs|cjs|js|json)$/.test(p)) claims.push({id:`${p}#asset:0`,kind:'asset',name:p,start:0,end:bytes.length,fingerprint:fingerprint(bytes),details:{},status:'pending',required_test_ids:[],gap:'Asset packaging/runtime consumer and supported-platform verification required.'});
  return {path:p,fingerprint:fingerprint(bytes),migration_owner:owner(p),status:'pending',required_test_ids:[],gap:'Workstream owner only; individual assignee and exact behavioral Rust test IDs/branch coverage pending. Static test imports are not evidence.',interface_ids:claims.map(c=>c.id).sort(),claims_fingerprint:claimsDigest(claims),claims};
 });
 return {schema_version:1,fingerprint_algorithm:'fnv1a64-bytes',policy:'All claims are pending candidates, never completeness or parity. Rust runtime uses no Node/Bun. Recapture is a reviewed baseline change.',directories,extra_files:extraFiles,categories,
 category_gaps:categories.map(kind=>({kind,status:'pending',gap:({route:'Resolve receiver identities, aliases, plugin prefixes, all()/route() methods, handler validation and effective JSON schemas.',tool:'Resolve registry factories/spreads, MCP/ACP/plugin/runtime supplied tools and external schemas.',ws_event:'Resolve templated names, broadcast wrappers, discriminants, payloads and activation.',sse_event:'Resolve raw writes/templates, dynamic event producers, replay and payload schemas.',db_table:'Reconcile Drizzle tables with raw SQL/FTS/virtual/conditional tables and legacy migrations.',db_migration:'Ordered migration candidates do not establish upgrade/rollback coverage.',config:'Resolve computed env lookups, destructuring, persisted settings, precedence and defaults.',cli:'Resolve top-level and nested dispatch, options, help, aliases and platform-specific entrypoints.',dependency:'Resolve dynamic imports, optional native engines, subprocess executables and packaging.',bridge:'Audit Node/Bun workers, embedded scripts, ACP/MCP engines, shell integration and external assets.',asset:'Generated web-dist, bundled messenger runtime, screen-share and external assets are outside source capture; packaging provenance pending.',platform:'linux/darwin/win32/Android source branches are observations; supported architecture/OS/runtime matrix and platform CI evidence pending.',schema:'Resolve schema references, validators, wire encodings and emitted JSON Schema; TS declarations alone do not establish wire schemas.'})[kind]})),files};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const target=path.join(root,'tests/contract/interfaces.json');
 const serialized=JSON.stringify(capture(),null,2)+'\n';
 if (process.argv.includes('--check')) { if(fs.readFileSync(target,'utf8')!==serialized) throw new Error('Interface manifest drift; review and recapture explicitly'); }
 else fs.writeFileSync(target,serialized);
 console.log(`interface capture ${process.argv.includes('--check')?'matches':'written'}`);
}
