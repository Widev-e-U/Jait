// Inventory capture only: no tests execute here. Rust owns the audit and all assertions.
import ts from '../../../node_modules/typescript/lib/typescript.js';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
const excluded = new Set(['node_modules', 'dist', 'build', 'web-dist', 'target', '.git']);
function walk(dir) { return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e => excluded.has(e.name) ? [] : e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(?:[cm]?js|tsx?)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [`${dir}/${e.name}`] : [] ).sort(); }
function fingerprint(text) { let hash=0xcbf29ce484222325n; for(const b of Buffer.from(text)) hash=BigInt.asUintN(64,(hash ^ BigInt(b))*0x100000001b3n); return hash.toString(16).padStart(16,'0'); }
function lane(p) {
 if (/security|consent|permission|auth|redact|ssrf|assessment|scope|execution-lease/.test(p)) return 'security-execution';
 if (/provider|backend|acp|mcp|stream|chat|agent|thread|team|goal|plan|session|ws\./.test(p)) return 'providers-streams-coordination';
 if (/db\/|database|migration|memory|embedding|retention|scheduler|cron/.test(p)) return 'storage-scheduler';
 if (/channel|email|calendar|voice|audio|screen|browser|preview|plugin|skill|node|terminal|pty/.test(p)) return 'native-integrations';
 return 'http-tools-config';
}
const manifestPath=path.join(root,'tests/contract/coverage.json');
const previous=fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath,'utf8')) : null;
const paths=walk('packages/gateway');
const testPaths=paths.filter(p => /\.(test|spec)\.[cm]?[jt]sx?$/.test(p));
const testFiles=[]; const references=new Map();
for(const p of testPaths) {
 const source=fs.readFileSync(path.join(root,p),'utf8'); const ast=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);
 const testNames=new Set(['it','test']); const suiteNames=new Set(['describe']); const imported=[];
 for(const statement of ast.statements) if(ts.isImportDeclaration(statement)) {
  const specifier=statement.moduleSpecifier.text;
  if(statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) for(const entry of statement.importClause.namedBindings.elements) {
   const original=(entry.propertyName ?? entry.name).text;
   if(['it','test'].includes(original)) testNames.add(entry.name.text);
   if(original==='describe') suiteNames.add(entry.name.text);
  }
  if(specifier?.startsWith('.')) {
   const relative=path.posix.normalize(path.posix.join(path.posix.dirname(p),specifier));
   const candidates=[relative,relative.replace(/\.js$/,'.ts'),`${relative}.ts`,`${relative}/index.ts`];
   for(const candidate of candidates) if(paths.includes(candidate) && !testPaths.includes(candidate)) { imported.push(candidate); if(!references.has(candidate))references.set(candidate,[]); references.get(candidate).push(p); break; }
  }
 }
 function rootName(expression) { while(ts.isCallExpression(expression)||ts.isPropertyAccessExpression(expression)||ts.isElementAccessExpression(expression)||ts.isTaggedTemplateExpression(expression)) expression=ts.isTaggedTemplateExpression(expression) ? expression.tag : expression.expression; return ts.isIdentifier(expression) ? expression.text : null; }
 function name(node) { const arg=node.arguments[0]; return arg && (ts.isStringLiteralLike(arg)||ts.isNoSubstitutionTemplateLiteral(arg)) ? arg.text : arg?.getText(ast) ?? '<missing>'; }
 const cases=[];
 function visit(node,scopes=[]) {
  if(ts.isCallExpression(node)) {
   const root=rootName(node.expression); const isSuite=suiteNames.has(root); const isTest=testNames.has(root);
   // The inner each/skipIf call configures a declaration; only the outer call declares it.
   const modifier=ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : null;
   const configuration=['each','for','skipIf','runIf','extend'].includes(modifier);
   if((isSuite || isTest) && !configuration) {
    const pos=ast.getLineAndCharacterOfPosition(node.getStart(ast));
    if(isTest) cases.push({id:`${p}:${pos.line+1}:${pos.character+1}`,line:pos.line+1,column:pos.character+1,name:name(node),suite:scopes,declaration:node.expression.getText(ast),parameterized:/\.(each|for)\s*\(/.test(node.expression.getText(ast)),status:'pending',rust_cases:[],boundary:p.includes('/routes/')?'http-or-websocket-contract':'public-behavior-or-isolated-protocol-fixture'});
    if(isSuite) { ts.forEachChild(node,child=>visit(child,[...scopes,name(node)])); return; }
   }
  }
  ts.forEachChild(node,child=>visit(child,scopes));
 }
 visit(ast);
 testFiles.push({path:p,fingerprint:fingerprint(source),lane:lane(p),direct_source_imports:[...new Set(imported)].sort(),declaration_count:cases.length,cases,...(!cases.length?{gap:'No recognized test declarations; manually inspect custom test helpers or generated cases.'}:{})});
}
const sourceFiles=paths.filter(p => !testPaths.includes(p)).map(p=>({path:p,fingerprint:fingerprint(fs.readFileSync(path.join(root,p),'utf8')),lane:lane(p),direct_test_references:[...new Set(references.get(p)??[])].sort(),status:'pending',rust_cases:[],gap:references.has(p)?'Existing direct imports do not establish Rust behavioral parity.':'No direct static import from inventoried test files; inspect indirect/integration coverage.'}));
const manifest={schema_version:1,policy:'Rust suite first: every declaration and source gap requires explicit behavior mapping and passing evidence against the TypeScript gateway before R09+.',fingerprint_algorithm:'fnv1a64-utf8',inventory_method:'TypeScript compiler AST: it/test declarations (including aliases, chained modifiers and parameterized declarations); source fingerprints detect drift.',limits:['Declarations inside loops/each are recorded once; runtime expansions and branch coverage require explicit Rust cases.','Static direct imports are triage hints only; unreferenced files are coverage-review gaps, not proof of absent TypeScript tests.','Pending does not claim parity. Merely registering a Rust scenario cannot establish equivalent assertions.','This inventory does not enumerate route/tool/schema/event contracts or prove gateway behavior.'],summary:{test_files:testFiles.length,test_declarations:testFiles.reduce((n,f)=>n+f.cases.length,0),runtime_source_files:sourceFiles.length,source_files_without_direct_test_import:sourceFiles.filter(f=>!f.direct_test_references.length).length,rust_verified_declarations:0},test_files:testFiles,source_files:sourceFiles};
// Deleted contracts are retained explicitly and cannot disappear during recapture.
manifest.retained_test_files=previous?.retained_test_files??[];
manifest.summary.retained_test_files=manifest.retained_test_files.length;
manifest.summary.retained_test_declarations=manifest.retained_test_files.reduce((n,f)=>n+(f.cases?.length??0),0);
// Only preserve reviewed mappings for byte-identical files. Changed sources reset to pending.
for (const field of ['test_files','source_files']) for (const file of manifest[field]) {
 const old=previous?.[field]?.find(item=>item.path===file.path && item.fingerprint===file.fingerprint);
 if (!old) continue;
 if (old.mapping_proposal !== undefined) file.mapping_proposal = old.mapping_proposal;
 const preserve=(next,prior)=>{ for(const key of ['status','rust_cases','parity_review']) if(prior?.[key]!==undefined)next[key]=prior[key]; };
 if(file.cases) for(const test of file.cases) preserve(test,old.cases?.find(item=>item.id===test.id));
 else preserve(file,old);
}
manifest.summary.rust_verified_declarations=[...manifest.test_files,...manifest.retained_test_files].reduce((sum,file)=>sum+file.cases.filter(test=>test.status==='verified').length,0);
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest.summary));
