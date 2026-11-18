// Source-to-source authoring only: never imports or executes gateway/tests.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { sourceGates } from './source-gates.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
process.chdir(root);
/**
 * Fixture files are named after their source test file, never after their
 * position in the discovery list. Positional names (`fixture0.ts`, `fixture1.ts`)
 * meant that inserting one test file reassigned the content of every later
 * fixture, so a regeneration rewrote ~97% of the directory (138 files, ~97k
 * lines) even when almost nothing changed, and `git log` on a fixture was
 * meaningless. The hash suffix keeps the name stable and unique when two source
 * paths slugify identically.
 */
const fixtureId=sourcePath=>{
 const slug=sourcePath.replace(/^packages\//,'').replace(/\.[^./]+$/,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase();
 const digest=createHash('sha256').update(sourcePath).digest('hex').slice(0,8);
 return `${slug}-${digest}`;
};
const require=createRequire(path.join(root,'package.json'));
const ts=require('typescript');
const inventory=JSON.parse(fs.readFileSync('tests/contract/coverage.json','utf8'));
const overrides=new Map([['packages/gateway/src/routes/messenger-regression.test.ts','tests/contract/tooling/sources/messenger-regression.test.ts.txt']]);
const readSource=f=>fs.readFileSync(overrides.get(f.path)??f.path,'utf8');
const files=[...inventory.test_files,...(inventory.retained_test_files??[])].filter(f=>{
 if(!fs.existsSync(f.path)&&!overrides.has(f.path))return false;
 if(/token-estimator|\/validate\.test/.test(f.path))return false;
 const s=readSource(f);
 const methods=[...s.matchAll(/\bvi\.(\w+)/g)].map(m=>m[1]);
 if(methods.some(m=>!['fn','mocked','spyOn','restoreAllMocks','clearAllMocks','resetAllMocks','stubGlobal','unstubAllGlobals','stubEnv','unstubAllEnvs','useFakeTimers','useRealTimers','setSystemTime','advanceTimersByTime','advanceTimersByTimeAsync','getTimerCount','waitFor','mock','doMock','hoisted','importActual','resetModules'].includes(m)))return false;

 return s.length<300000&&!/mock\.module|bun:test/.test(s);
});
const declarations=[],translated=[],groups=[];
const rustString=s=>{let hashes='#';while(s.includes('"'+hashes))hashes+='#';return 'r'+hashes+'"'+s+'"'+hashes;};
let regexDefinitions=new Map();
let valueBindings=new Map();
function regexPlan(n){
 const literal=n.getText();const slash=literal.lastIndexOf('/');const flags=literal.slice(slash+1),body=literal.slice(1,slash);
 if(/[^igmsuy]/.test(flags))throw Error('Unsupported regex flags');
 let index=0,id=0;
 const node=(kind,fields={})=>({id:id++,kind,...fields});
 const literalChar=()=>{const c=String.fromCodePoint(body.codePointAt(index));index+=c.length;return c;};
 function escape(inClass){
  const c=literalChar();
  if('dDsSwW'.includes(c))return {category:c};
  if((c==='b'||c==='B')&&!inClass)return {boundary:c==='b'};
  const mapped={n:'\n',r:'\r',t:'\t',v:'\v',f:'\f',b:'\b',0:'\0'};
  if(Object.hasOwn(mapped,c))return {char:mapped[c]};
  if(c==='x'||c==='u'){
   if(c==='u'&&body[index]==='{'){const end=body.indexOf('}',++index),value=parseInt(body.slice(index,end),16);index=end+1;return {char:String.fromCodePoint(value)};}
   const length=c==='x'?2:4,value=parseInt(body.slice(index,index+length),16);index+=length;return {char:String.fromCharCode(value)};
  }
  if(/[1-9]/.test(c))throw Error('Regex backreference requires explicit Rust translation');
  return {char:c};
 }
 function atom(){
  const c=literalChar();
  if(c==='('){
   if(body[index]==='?'){if(body.slice(index,index+2)!=='?:')throw Error('Regex lookaround requires explicit Rust translation');index+=2;}
   const inner=alternation();if(body[index++]!==')')throw Error('Unclosed regex group');return inner;
  }
  if(c==='['){
   const negate=body[index]==='^';if(negate)index++;
   const items=[];
   const item=()=>body[index]==='\\'?(index++,escape(true)):{char:literalChar()};
   while(index<body.length&&body[index]!==']'){
    const first=item();
    if(first.char!==undefined&&body[index]==='-'&&body[index+1]!==']'){
     index++;const last=item();if(last.char===undefined)throw Error('Regex range category');items.push({low:first.char,high:last.char});
    }else if(first.char!==undefined)items.push({low:first.char,high:first.char});else items.push(first);
   }
   if(body[index++]!==']')throw Error('Unclosed regex class');return node('class',{items,negate});
  }
  if(c==='\\'){
   const escaped=escape(false);
   if(escaped.category)return node('class',{items:[escaped],negate:false});
   if(escaped.boundary!==undefined)return node(escaped.boundary?'boundary':'nonboundary');
   return node('char',{value:escaped.char});
  }
  if(c==='.')return node('any');if(c==='^')return node('start');if(c==='$')return node('end');
  return node('char',{value:c});
 }
 function sequence(){
  const nodes=[];
  while(index<body.length&&body[index]!==')'&&body[index]!=='|'){
   let child=atom(),min,max;
   const q=body[index];
   if(q==='*'||q==='+'||q==='?'){index++;min=q==='+'?1:0;max=q==='?'?1:null;}
   else if(q==='{'){
    const match=/^\{(\d+)(?:,(\d*)?)?\}/.exec(body.slice(index));
    if(match){index+=match[0].length;min=Number(match[1]);max=match[0].includes(',')?(match[2]?Number(match[2]):null):min;}
   }
   if(min!==undefined){child=node('repeat',{node:child,min,max});if(body[index]==='?')index++;}
   nodes.push(child);
  }
  return node('seq',{nodes});
 }
 function alternation(){const nodes=[sequence()];while(body[index]==='|'){index++;nodes.push(sequence());}return nodes.length===1?nodes[0]:node('alt',{nodes});}
 const expr=alternation();if(index!==body.length)throw Error('Unconsumed regex input');
 return {__jait_matcher:'textPattern',expr,flags};
}
function staticValue(n){
 if(!n)throw Error('no static expected');
 if(ts.isIdentifier(n)&&valueBindings.has(n.text))return staticValue(valueBindings.get(n.text));
 if(ts.isIdentifier(n)&&n.text==='undefined')return {__jait_type:'undefined'};
 if(ts.isPropertyAccessExpression(n)){const object=staticValue(n.expression);if(Object.hasOwn(object,n.name.text))return object[n.name.text];throw Error('Dynamic member');}
 if(ts.isRegularExpressionLiteral(n))return regexPlan(n);
 if(ts.isIdentifier(n)&&regexDefinitions.has(n.text))return regexPlan(regexDefinitions.get(n.text));
 if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isNonNullExpression(n))return staticValue(n.expression);
 if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText()==='expect.not'){
  const matcher=n.expression.name.text;
  if(['objectContaining','arrayContaining','stringContaining'].includes(matcher))return {__jait_matcher:'not',value:{__jait_matcher:matcher,value:staticValue(n.arguments[0])}};
  throw Error('Unsupported negated asymmetric expectation');
 }
 if(ts.isStringLiteralLike(n))return n.text;
 if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText()==='expect'){
  const matcher=n.expression.name.text;
  if(matcher==='stringMatching'){const value=staticValue(n.arguments[0]);if(value.__jait_matcher==='textPattern')return value;throw Error('String regex constructor needs explicit plan');}
  if(matcher==='anything')return {__jait_matcher:'anything'};
  if(matcher==='any')return {__jait_matcher:'any',type:n.arguments[0].getText()};
  if(['objectContaining','arrayContaining','stringContaining'].includes(matcher))return {__jait_matcher:matcher,value:staticValue(n.arguments[0])};
  throw Error('Unsupported asymmetric matcher');
 }
 if(ts.isNumericLiteral(n))return Number(n.text);
 if(n.kind===ts.SyntaxKind.TrueKeyword)return true;
 if(n.kind===ts.SyntaxKind.FalseKeyword)return false;
 if(n.kind===ts.SyntaxKind.NullKeyword)return null;
 if(ts.isPrefixUnaryExpression(n)&&n.operator===ts.SyntaxKind.MinusToken)return -staticValue(n.operand);
 if(ts.isArrayLiteralExpression(n))return n.elements.map(staticValue);
 if(ts.isObjectLiteralExpression(n))return Object.fromEntries(n.properties.map(p=>{
  if(!ts.isPropertyAssignment(p))throw Error('nonliteral object property');
  return [p.name.text,staticValue(p.initializer)];
 }));
 throw Error('dynamic expected');
}
function hybridPlan(n,expressions){
 try{return staticValue(n)}catch{}
 if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isNonNullExpression(n))return hybridPlan(n.expression,expressions);
 if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText()==='expect'){
  const kind=n.expression.name.text;
  if(['objectContaining','arrayContaining','stringContaining'].includes(kind))return {__jait_matcher:kind,value:hybridPlan(n.arguments[0],expressions)};
  throw Error('Unsupported hybrid asymmetric matcher');
 }
 if(ts.isObjectLiteralExpression(n))return Object.fromEntries(n.properties.map(p=>{
  if(ts.isPropertyAssignment(p)&&!ts.isComputedPropertyName(p.name))return [p.name.text,hybridPlan(p.initializer,expressions)];
  if(ts.isShorthandPropertyAssignment(p))return [p.name.text,hybridPlan(p.name,expressions)];
  throw Error('Computed/spread asymmetric property needs manual translation');
 }));
 if(ts.isArrayLiteralExpression(n))return n.elements.map(child=>hybridPlan(child,expressions));
 if(hasIdentifier(n,'expect'))throw Error('Unsupported nested asymmetric expression');
 const index=expressions.length;expressions.push(n);return {__jait_observed:index};
}
const supported=new Set(['toBe','toEqual','toStrictEqual','toMatchObject','toContain','toContainEqual','toHaveLength','toBeGreaterThan','toBeGreaterThanOrEqual','toBeLessThan','toBeLessThanOrEqual','toBeDefined','toBeUndefined','toBeNull','toBeTruthy','toBeFalsy','toThrow','toThrowError','toBeInstanceOf','toBeTypeOf','toHaveBeenCalled','toHaveBeenCalledOnce','toHaveBeenCalledTimes','toHaveBeenCalledWith','toHaveBeenLastCalledWith','toHaveBeenNthCalledWith','toHaveProperty','toMatch']);
const hooks=new Set(['beforeEach','beforeAll','afterEach','afterAll']);
function isHook(n){return ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&ts.isIdentifier(n.expression.expression)&&hooks.has(n.expression.expression.text);}
function hasRegistration(n){let found=false;function check(x){if(ts.isCallExpression(x)&&ts.isIdentifier(x.expression)&&['it','test','describe'].includes(x.expression.text))found=true;if(ts.isPropertyAccessExpression(x)&&ts.isIdentifier(x.expression)&&['it','test','describe'].includes(x.expression.text))found=true;ts.forEachChild(x,check)}check(n);return found;}
function hasIdentifier(n,text){let found=false;function visit(x){if(ts.isIdentifier(x)&&x.text===text)found=true;ts.forEachChild(x,visit)}visit(n);return found;}
for(const f of files){
 const source=readSource(f);
 const sf=ts.createSourceFile(f.path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 regexDefinitions=new Map();
 const findRegex=n=>{if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&ts.isRegularExpressionLiteral(n.initializer))regexDefinitions.set(n.name.text,n.initializer);ts.forEachChild(n,findRegex);};findRegex(sf);
 const pathAdjustments=[];
 const relativeModule=p=>{
  let rel=path.relative(path.resolve('tests/contract/drivers/tailstatic'),path.resolve(path.dirname(f.path),p)).split(path.sep).join('/');
  return rel.startsWith('.')?rel:'./'+rel;
 };
 function adjust(n){
  if(ts.isPropertyAccessExpression(n)&&ts.isMetaProperty(n.expression)&&n.expression.keywordToken===ts.SyntaxKind.ImportKeyword){
   if(n.name.text==='dirname'||n.name.text==='url'){pathAdjustments.push({start:n.getStart(sf),end:n.end,text:n.name.text==='dirname'?'__jait_original_dir':'__jait_original_url'});return;}
  }
  if(ts.isIdentifier(n)&&n.text==='__dirname'){pathAdjustments.push({start:n.getStart(sf),end:n.end,text:'__jait_original_dir'});return;}
  if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&!n.arguments[0].text.startsWith('.')&&!/^(node:|bun:)/.test(n.arguments[0].text)){
   const literal=n.arguments[0];
   pathAdjustments.push({start:literal.getStart(sf),end:literal.end,text:'Bun.resolveSync('+JSON.stringify(literal.text)+', __jait_original_dir)'});
  }
  if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text.startsWith('.')){
   const literal=n.arguments[0];
   if(source.includes('vi.resetModules')){
    pathAdjustments.push({start:n.getStart(sf),end:n.end,text:'vi.importFresh(new URL('+JSON.stringify(relativeModule(literal.text))+',import.meta.url).href)'});return;
   }
   pathAdjustments.push({start:literal.getStart(sf),end:literal.end,text:JSON.stringify(relativeModule(literal.text))});
  }
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&ts.isIdentifier(n.expression.expression)&&n.expression.expression.text==='vi'&&['mock','doMock','importActual'].includes(n.expression.name.text)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])){
   const literal=n.arguments[0];
   let replacement;
   if(literal.text.startsWith('.')){
    let target=path.resolve(path.dirname(f.path),literal.text);
    if(target.endsWith('.js')&&fs.existsSync(target.slice(0,-3)+'.ts'))target=target.slice(0,-3)+'.ts';
    const relative=path.relative(path.resolve('tests/contract/drivers/tailstatic'),target).split(path.sep).join('/');
    replacement='__jait_fileURLToPath(new URL('+JSON.stringify(relative.startsWith('.')?relative:'./'+relative)+',import.meta.url))';
   }else if(literal.text.startsWith('node:'))replacement=literal.getText(sf);
   else replacement='Bun.resolveSync('+literal.getText(sf)+', __jait_original_dir)';
   pathAdjustments.push({start:literal.getStart(sf),end:literal.end,text:replacement});
  }
  ts.forEachChild(n,adjust);
 }
 adjust(sf);
 function adjustedText(node){let text=node.getText(sf);const start=node.getStart(sf);for(const r of pathAdjustments.filter(r=>r.start>=start&&r.end<=node.end).sort((a,b)=>b.start-a.start))text=text.slice(0,r.start-start)+r.text+text.slice(r.end-start);return text;}
 const moduleMocking=/\bvi\.(mock|doMock)\(/.test(source);
 const runtimeImports=[];
 const imports=sf.statements.filter(ts.isImportDeclaration).filter(n=>n.moduleSpecifier.text!=='vitest').map(n=>{
  let text=n.getText(sf),p=n.moduleSpecifier.text;
  if(p.startsWith('.')){
   let absolute=path.resolve(path.dirname(f.path),p);
   let rel=path.relative(path.resolve('tests/contract/drivers/tailstatic'),absolute).split(path.sep).join('/');
   if(!rel.startsWith('.'))rel='./'+rel;
   text=text.replace(n.moduleSpecifier.getText(sf),JSON.stringify(rel));
  }
  if((moduleMocking||!p.startsWith('.')&&!p.startsWith('node:'))&&!n.importClause?.isTypeOnly){
   // Resolve dependencies from the original workspace, where they are installed.
   const moduleText=p.startsWith('.')?JSON.stringify(relativeModule(p)):p.startsWith('node:')?JSON.stringify(p):p==='ws'?'(typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\\.json$/,"wrapper.mjs"))':'(typeof Bun!=="undefined"?Bun.resolveSync('+JSON.stringify(p)+', __jait_original_dir):__jait_require.resolve('+JSON.stringify(p)+'))';
   const fields=[];
   if(n.importClause?.name)fields.push('default: '+n.importClause.name.text);
   const bindings=n.importClause?.namedBindings;
   if(bindings&&ts.isNamespaceImport(bindings))runtimeImports.push('const '+bindings.name.text+' = await import('+moduleText+');');
   if(bindings&&ts.isNamedImports(bindings))for(const item of bindings.elements)if(!item.isTypeOnly)fields.push(item.propertyName?item.propertyName.text+': '+item.name.text:item.name.text);
   if(fields.length)runtimeImports.push('const { '+fields.join(', ')+' } = await import('+moduleText+');');
   if(!n.importClause)runtimeImports.push('await import('+moduleText+');');
   return '';
  }
  return text;
 });
 if(/\bvi\./.test(source))imports.push("import { vi } from '../tailmock.ts';");
 const suiteAliases=new Set();
 for(const statement of sf.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){if(ts.isIdentifier(declaration.name)&&declaration.initializer&&hasIdentifier(declaration.initializer,'describe'))suiteAliases.add(declaration.name.text);}
 const outer=sf.statements.filter(n=>!isHook(n)&&!ts.isImportDeclaration(n)&&!hasRegistration(n)&&!(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&suiteAliases.has(d.name.text))));
 function isHoisted(statement){
  if(ts.isVariableStatement(statement))return statement.declarationList.declarations.some(d=>d.initializer&&ts.isCallExpression(d.initializer)&&(d.initializer.expression.getText(sf)==='vi.hoisted'||d.initializer.expression.getText(sf)==='vi.fn'&&d.initializer.arguments.length===0));
  return ts.isExpressionStatement(statement)&&ts.isCallExpression(statement.expression)&&['vi.mock','vi.doMock'].includes(statement.expression.expression.getText(sf));
 }
 const moduleSetup=moduleMocking?outer.filter(isHoisted):[];
 const hookName=h=>'__jait_hook_'+h.getStart(sf);
 const hookDef=h=>({__jait_hook:h});
 outer.push(...sf.statements.filter(isHook).map(hookDef));
 const cases=[];
 const definitions=new Map();
 function findDefinitions(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer)definitions.set(n, n.initializer);ts.forEachChild(n,findDefinitions);}findDefinitions(sf);
 const printer=ts.createPrinter();
 const text=n=>n.pos>=0?n.getText(sf):printer.printNode(ts.EmitHint.Unspecified,n,sf);
 function unwrap(n){while(ts.isAsExpression(n)||ts.isParenthesizedExpression(n)||ts.isNonNullExpression(n)||ts.isSatisfiesExpression(n))n=n.expression;return n;}
 function table(n,seen=new Set()){
  n=unwrap(n);
  if(ts.isIdentifier(n)){
   for(let scope=n.parent;scope;scope=scope.parent){
    const declaration=[...definitions.keys()].find(d=>d.name.text===n.text&&d.parent.parent.parent===scope);
    if(declaration&&!seen.has(declaration)){seen.add(declaration);return table(definitions.get(declaration),seen);}
   }
  }
  if(ts.isArrayLiteralExpression(n)&&!n.elements.some(ts.isSpreadElement))return [...n.elements];
  throw Error('Table needs manual static expansion');
 }
 function bind(name,initializer,environment){
  const next=new Map(environment);
  function add(name,value){
   if(ts.isIdentifier(name)){next.set(name.text,value);return;}
   value=unwrap(value);
   if(ts.isArrayBindingPattern(name)&&ts.isArrayLiteralExpression(value))name.elements.forEach((entry,index)=>{if(ts.isBindingElement(entry))add(entry.name,value.elements[index]??ts.factory.createIdentifier('undefined'));});
   if(ts.isObjectBindingPattern(name)&&ts.isObjectLiteralExpression(value))for(const entry of name.elements){const key=entry.propertyName?.text??entry.name.text;const prop=value.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.text===key);if(prop)add(entry.name,prop.initializer);}
  }
  add(name,initializer);
  return {statement:'const '+text(name)+' = '+text(initializer)+';',environment:next};
 }
 function variantBindings(fn,item,environment){
  const unwrapped=unwrap(item),args=ts.isArrayLiteralExpression(unwrapped)?[...unwrapped.elements]:[item];
  const statements=[];let env=environment;
  fn.parameters.forEach((param,index)=>{const result=bind(param.name,param.dotDotDotToken?ts.factory.createArrayLiteralExpression(args.slice(index)):(args[index]??param.initializer??ts.factory.createIdentifier('undefined')),env);statements.push(result.statement);env=result.environment;});
  return {statements,environment:env};
 }
 function visit(n,scopes=[],lifecycle=[],suffix='',environment=new Map()){
  if(ts.isCallExpression(n)&&ts.isCallExpression(n.expression)&&ts.isPropertyAccessExpression(n.expression.expression)&&n.expression.expression.name.text==='each'){
   const base=n.expression.expression.expression;
   if(ts.isCallExpression(base)&&ts.isPropertyAccessExpression(base.expression)&&['skipIf','runIf'].includes(base.expression.name.text)&&ts.isIdentifier(base.expression.expression)){
    const each=ts.factory.updateCallExpression(n.expression,ts.factory.updatePropertyAccessExpression(n.expression.expression,ts.factory.createIdentifier(base.expression.expression.text),'each'),n.expression.typeArguments,n.expression.arguments);
    const plain=ts.factory.updateCallExpression(n,each,n.typeArguments,n.arguments);
    visit(plain,[...scopes,'/*__jait_source_gate__ '+base.expression.name.text+' '+base.arguments[0].getText(sf).replaceAll('*/','* /')+' */'],lifecycle,suffix,environment);return;
   }
  }
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&suiteAliases.has(n.expression.text)){
   const plain=ts.factory.updateCallExpression(n,ts.factory.createIdentifier('describe'),n.typeArguments,n.arguments);
   visit(plain,scopes,lifecycle,suffix,environment);return;
  }
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&ts.isIdentifier(n.expression.expression)&&['describe','it','test'].includes(n.expression.expression.text)&&['skip','only'].includes(n.expression.name.text)){
   const plain=ts.factory.updateCallExpression(n,ts.factory.createIdentifier(n.expression.expression.text),n.typeArguments,n.arguments);
   visit(plain,n.expression.name.text==='skip'?[...scopes,'/*__jait_source_gate__ explicit skip */']:scopes,lifecycle,suffix,environment);return;
  }
  if(ts.isCallExpression(n)&&ts.isCallExpression(n.expression)&&ts.isPropertyAccessExpression(n.expression.expression)&&['skipIf','runIf'].includes(n.expression.expression.name.text)){
   const kind=n.expression.expression.expression;
   if(ts.isIdentifier(kind)&&['describe','it','test'].includes(kind.text)){
    const plain=ts.factory.updateCallExpression(n,ts.factory.createIdentifier(kind.text),n.typeArguments,n.arguments);
    visit(plain,[...scopes,'/*__jait_source_gate__ '+n.expression.expression.name.text+' '+n.expression.arguments[0].getText(sf).replaceAll('*/','* /')+' */'],lifecycle,suffix,environment);return;
   }
  }

  if(ts.isForOfStatement(n)&&hasRegistration(n)){
   try{
    const name=n.initializer.declarations[0].name;
    const variants=table(n.expression);
    const statements=ts.isBlock(n.statement)?[...n.statement.statements]:[n.statement];
    const localSetup=statements.filter(s=>!isHook(s)&&!hasRegistration(s));
    variants.forEach((item,index)=>{const binding=bind(name,item,environment);for(const statement of statements)if(hasRegistration(statement))visit(statement,[...scopes,binding.statement,...localSetup],lifecycle,suffix+'_for'+index,binding.environment);});
   }catch{
    const statements=ts.isBlock(n.statement)?[...n.statement.statements]:[n.statement];
    const setup=statements.filter(s=>!isHook(s)&&!hasRegistration(s));
    const open='/*__jait_loop_open__*/for ('+adjustedText(n.initializer)+' of '+adjustedText(n.expression)+') {';
    for(const statement of statements)if(hasRegistration(statement))visit(statement,[...scopes,open,...setup],lifecycle,suffix+'_runtime',environment);
   }return;
  }
  if(ts.isCallExpression(n)&&ts.isCallExpression(n.expression)&&ts.isPropertyAccessExpression(n.expression.expression)){
   const property=n.expression.expression;
   if(property.name.text==='each'&&ts.isIdentifier(property.expression)&&['describe','it','test'].includes(property.expression.text)){
    try{
     const fn=n.arguments.find(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a));
     const variants=table(n.expression.arguments[0]);
     const plain=ts.factory.updateCallExpression(n,ts.factory.createIdentifier(property.expression.text),n.typeArguments,n.arguments);
     variants.forEach((item,index)=>{const binding=variantBindings(fn,item,environment);visit(plain,[...scopes,'/*__jait_scope_open__*/{',...binding.statements],lifecycle,suffix+'_each'+index,binding.environment);});
    }catch{
     const fn=n.arguments.find(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a));
     if(fn){
      const item='__jait_variant_'+n.getStart(sf);const args=item+'_args';
      const bindings=fn.parameters.map((param,index)=>'const '+param.name.getText(sf)+' = '+(param.dotDotDotToken?args+'.slice('+index+')':args+'['+index+']')+';');
      const open='/*__jait_loop_open__*/for (const '+item+' of '+adjustedText(n.expression.arguments[0])+') { const '+args+'=Array.isArray('+item+')?'+item+':['+item+'];';
      const plain=ts.factory.updateCallExpression(n,ts.factory.createIdentifier(property.expression.text),n.typeArguments,n.arguments);
      visit(plain,[...scopes,open,...bindings],lifecycle,suffix+'_runtime',environment);
     }
    }return;
   }
  }
  if(ts.isIfStatement(n)&&hasRegistration(n)){
   const branch=(statement,condition)=>{
    const statements=ts.isBlock(statement)?[...statement.statements]:[statement];
    const setup=statements.filter(s=>!isHook(s)&&!hasRegistration(s));
    for(const child of statements)if(hasRegistration(child))visit(child,[...scopes,'/*__jait_loop_open__*/if ('+condition+') {',...setup],lifecycle,suffix+'_branch',environment);
   };
   branch(n.thenStatement,adjustedText(n.expression));if(n.elseStatement)branch(n.elseStatement,'!('+adjustedText(n.expression)+')');return;
  }
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='describe'){
   const fn=n.arguments.find(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a));
   if(fn&&ts.isBlock(fn.body)){
    const setup=fn.body.statements.filter(s=>!isHook(s)&&!hasRegistration(s));
    const localHooks=fn.body.statements.filter(isHook);
    for(const s of fn.body.statements)if(!isHook(s))visit(s,[...scopes,'/*__jait_scope_open__*/{',...setup,...localHooks.map(hookDef)],[...lifecycle,...localHooks],suffix,environment);
   }
   return;
  }
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['it','test'].includes(n.expression.text)){
   const fn=n.arguments.find(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a));
   const line=sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
   const currentName=ts.isStringLiteralLike(n.arguments[0])?n.arguments[0].text:n.arguments[0].getText(sf);
   const named=f.cases.filter(c=>c.name===currentName);
   const original=named.find(c=>c.line===line)??named.sort((a,b)=>Math.abs(a.line-line)-Math.abs(b.line-line))[0];
   const originalId=original?.id??`${f.path}:current:${line}`;
   let report=declarations.find(d=>d.original===originalId);
   if(!report){report={original:originalId,name:original?.name??currentName,vectors:[],status:'gap',gaps:''};declarations.push(report);}
   valueBindings=environment;
   if(!fn||(fn.parameters.length&&!suffix)){report.gaps='Callback shape or parameterized fixture requires manual translation';return;}
   try{
    const rules=[], replacements=[];
    const setupNodes=[...outer,...scopes];
    const allHooks=[...sf.statements.filter(isHook),...lifecycle];
    const before=allHooks.filter(h=>h.expression.expression.text.startsWith('before'));
    const after=allHooks.filter(h=>h.expression.expression.text.startsWith('after')).reverse();
    const scan=x=>{
     if(ts.isCallExpression(x)&&ts.isPropertyAccessExpression(x.expression)){
      const matcher=x.expression.name.text;
      let inner=x.expression.expression,negate=false,mode='value';
      while(ts.isPropertyAccessExpression(inner)){
       if(inner.name.text==='not')negate=true;
       else if(inner.name.text==='rejects')mode='rejects';
       else if(inner.name.text==='resolves')mode='resolves';
       else break;
       inner=inner.expression;
      }
      if(ts.isCallExpression(inner)&&ts.isIdentifier(inner.expression)&&inner.expression.text==='expect'){
       if(!supported.has(matcher))throw Error('Unsupported matcher: '+matcher);
       
       if(inner.arguments.length<1||inner.arguments.length>2)throw Error('Unexpected expect arguments');
       const actual=adjustedText(inner.arguments[0]);
       const argumentMatchers=['toHaveBeenCalledWith','toHaveBeenLastCalledWith','toHaveBeenNthCalledWith'];
       let expected=x.arguments[0];
       if(argumentMatchers.includes(matcher))expected=ts.factory.createArrayLiteralExpression(x.arguments);
       let hybridExpressions;
       const expectedText=()=>hybridExpressions?'['+hybridExpressions.map(adjustedText).join(',')+']':argumentMatchers.includes(matcher)?'['+x.arguments.map(adjustedText).join(',')+']':adjustedText(expected);
       const slot=rules.length;
       const rule={matcher,negate};if(mode==='rejects'&&!['toThrow','toThrowError'].includes(matcher))rule.rejects=true;
       let ancestor=x.parent;while(ancestor&&ancestor!==fn){if(ts.isIfStatement(ancestor)||ts.isConditionalExpression(ancestor))rule.conditional=true;if(ts.isArrowFunction(ancestor)||ts.isFunctionExpression(ancestor)||ts.isFunctionDeclaration(ancestor)){rule.optional=true;break;}ancestor=ancestor.parent;}
       let dynamic=false;
       if(expected){
        if(ts.isRegularExpressionLiteral(expected)||(ts.isIdentifier(expected)&&regexDefinitions.has(expected.text)))regexPlan(ts.isRegularExpressionLiteral(expected)?expected:regexDefinitions.get(expected.text));
        try{rule.expected=staticValue(expected)}catch{dynamic=true;rule.dynamic=true;}
       }
       if(matcher==='toBeInstanceOf'){rule.dynamic=true;dynamic=true;rule.__jait_instance=true;}
       if(expected&&dynamic&&hasIdentifier(expected,'expect')){hybridExpressions=[];rule.expected=hybridPlan(expected,hybridExpressions);rule.hybrid=true;delete rule.dynamic;}
       if(matcher==='toHaveProperty'&&x.arguments[1])rule.propertyValue=staticValue(x.arguments[1]);
       rules.push(rule);
       let call;
       if(matcher==='toThrow'||matcher==='toThrowError'){
        const other=dynamic?', ('+expectedText()+')':'';
        call=mode==='rejects'?`__jait_rejected(${slot}, ${actual}${other})`:`__jait_thrown(${slot}, ${actual}${other})`;
       }else if(matcher==='toBeInstanceOf')call=`${mode==='rejects'?'__jait_instanceRejected':'__jait_instance'}(${slot}, ${actual}, ${expected.getText(sf)})`;
       else call=`${mode==='rejects'?'__jait_captureRejected':mode==='resolves'?'__jait_captureResolved':['toBeDefined','toBeUndefined','toBeNull','toBeTruthy','toBeFalsy','toBeTypeOf'].includes(matcher)?'__jait_captureType':'__jait_capture'}(${slot}, (${matcher.startsWith('toHaveBeen')?actual+'.mock.calls':actual})${dynamic?', ('+expectedText()+')':''})`;
       replacements.push({start:x.getStart(sf),end:x.end,text:call});
       return;
      }
     }
     if(ts.isIdentifier(x)&&x.text==='expect')throw Error('Untranslated expectation or expect helper');
     if(ts.isCallExpression(x)&&ts.isIdentifier(x.expression)&&x.expression.text==='tmpdir'&&x.arguments.length===0){replacements.push({start:x.getStart(sf),end:x.end,text:'__jait_fixture_dir'});return;}
     ts.forEachChild(x,scan);
    };
    for(const s of setupNodes)if(typeof s!=='string'&&!s.__jait_hook)scan(s);
    for(const hook of [...before,...after])scan(hook.expression.arguments[0]);
    scan(fn.body);
    if(rules.every(rule=>rule.optional||rule.conditional))rules.push({matcher:'toComplete',negate:false});
    function rewrite(node){if(typeof node==='string')return node;if(node.__jait_hook)return 'const '+hookName(node.__jait_hook)+' = '+rewrite(node.__jait_hook.expression.arguments[0])+';';let text=node.getText(sf);const start=node.getStart(sf);const all=[...replacements,...pathAdjustments.filter(a=>!replacements.some(r=>a.start>=r.start&&a.end<=r.end))];for(const r of all.filter(r=>r.start>=start&&r.end<=node.end).sort((a,b)=>b.start-a.start))text=text.slice(0,r.start-start)+r.text+text.slice(r.end-start);return text.replace(/^export\s+(?:default\s+)?/,'');}
    const id='tailstatic_'+f.path.replace(/[^a-zA-Z0-9]/g,'_')+'_'+line+'_'+(sf.getLineAndCharacterOfPosition(n.getStart(sf)).character+1)+suffix;
    const setup=setupNodes.filter(s=>!moduleSetup.includes(s)).map(rewrite).join('\n');
    const prelude=moduleSetup.map(s=>(ts.isExpressionStatement(s)?'await ':'')+rewrite(s)).join('\n')+'\n'+runtimeImports.join('\n');
    const body=ts.isBlock(fn.body)?rewrite(fn.body).slice(1,-1):'await ('+rewrite(fn.body)+');';
    const completionSlot=rules.findIndex(rule=>rule.matcher==='toComplete');
    const completion=completionSlot>=0?'__jait_record({slot:'+completionSlot+',completed:true});':'';
    const closeLoops=setupNodes.filter(s=>typeof s==='string'&&(s.startsWith('/*__jait_loop_open__*/')||s.startsWith('/*__jait_scope_open__*/'))).map(()=>'}').join('\n');
    const hookCall=h=>'await '+hookName(h)+'();';
    const driverBody=`${prelude}\n${setup}\n${before.map(hookCall).join('\n')}\ntry {\nawait (async()=>{\n${body}\n})();\n${completion}\n} finally {\n${after.map(hookCall).join('\n')}\n}\n${closeLoops}\n`;
    if(/\bexpect\s*\(/.test(driverBody))throw Error('Untranslated assertion');
    cases.push({id,body:driverBody,rules,report,...sourceGates(scopes)});
    translated.push({id,report,rules});
    report.status=report.gaps?'partial-authored-unrun':'authored-unrun';report.vectors.push(id);report.assertionsCovered=`${rules.filter(rule=>rule.matcher!=='toComplete').length} original comparison sites and ${rules.filter(rule=>rule.matcher==='toComplete').length} synthetic completion guards; runtime loop repetitions are evaluated by Rust.`;
   }catch(e){report.gaps=e.message;report.status=report.vectors.length?'partial-authored-unrun':'gap';}
   return;
  }
  // Parameterized suites/registration loops need explicit variant expansion.
  if((ts.isCallExpression(n)||ts.isForStatement(n)||ts.isForOfStatement(n)||ts.isForInStatement(n))&&hasRegistration(n))return;
  ts.forEachChild(n,c=>visit(c,scopes,lifecycle,suffix,environment));
 }
 for(const statement of sf.statements)if(!isHook(statement))visit(statement);
 for(const original of f.cases){if(!declarations.some(d=>d.original===original.id))declarations.push({original:original.id,name:original.name,vectors:[],status:'gap',gaps:'Parameterized or modified declaration requires manual fixtures'});}
 if(cases.length)groups.push({path:f.path,imports,cases,originalModule:relativeModule('./'+path.basename(f.path))});
}
const shared=`const __jait_symbols=new Map<symbol,number>();\nconst __jait_nestedRefs=new WeakMap<object,number>();let __jait_nextNestedRef=1;\nfunction __jait_nestedRef(value:object):number{let id=__jait_nestedRefs.get(value);if(!id){id=__jait_nextNestedRef++;__jait_nestedRefs.set(value,id)}return id;}\n// Fixture transport only. Rust owns all comparison semantics.\nfunction __jait_boxed(value: any): any {\n const type=typeof value;\n if(type==='symbol'){let id=__jait_symbols.get(value);if(!id){id=__jait_symbols.size+1;__jait_symbols.set(value,id)}return {type,value:id};}\n if(type==='function')return {type,name:value.name};\n if(type==='undefined')return {type};\n if(type==='bigint')return {type,value:String(value)};\n if(type==='number'&&!Number.isFinite(value))return {type:'nonfinite',value:String(value)};\n const prototype=type==='object'&&value!==null?(Object.getPrototypeOf(value)?.constructor?.name??null):null;\n if(value instanceof Error)value={...value,name:value.name,message:value.message,...('cause' in value?{cause:value.cause}:{})};\n return JSON.parse(JSON.stringify({type,value,prototype},function(this:any,_key:string,child:any){const original=Object.getOwnPropertyDescriptor(this,_key)?.value;if(original instanceof Date)return {__jait_type:'date',value:Number.isNaN(original.getTime())?'NaN':original.toISOString()};if(typeof child==='string'&&!child.isWellFormed())return {__jait_type:'utf16',units:Array.from({length:child.length},(_,i)=>child.charCodeAt(i))};if(typeof AbortSignal!=='undefined'&&child instanceof AbortSignal)return {__jait_type:'AbortSignal',aborted:child.aborted,ref:__jait_nestedRef(child)};if(child instanceof Map)return {__jait_type:'map',entries:[...child]};if(child instanceof Set)return {__jait_type:'set',values:[...child]};if(child instanceof RegExp)return {__jait_type:'regexp',source:child.source,flags:child.flags};if(ArrayBuffer.isView(child)&&!(child instanceof DataView))return {__jait_type:child.constructor.name,values:Array.from(child as any)};if(typeof child==='number'&&!Number.isFinite(child))return {__jait_type:'nonfinite',value:String(child)};return typeof child==='bigint'?{__jait_type:'bigint',value:String(child)}:typeof child==='undefined'?{__jait_type:'undefined'}:typeof child==='function'?{__jait_type:'function',ref:__jait_nestedRef(child)}:child;}));\n}\n`;
for(let i=0;i<groups.length;i++){
 const group=groups[i];
 const id=fixtureId(group.path);
 let code=`// Translated fixture from ${group.path}; expected literals are in tail_static.rs.\n${group.imports.join('\n')}\nimport { createRequire as __jait_createRequire } from 'node:module';\nimport { observe as __jait_observe } from '../tailtransport.ts';\nimport { mkdir as __jait_mkdir } from 'node:fs/promises';\nimport { fileURLToPath as __jait_fileURLToPath } from 'node:url';\nconst __jait_original_url=new URL(${JSON.stringify(group.originalModule)},import.meta.url).href;\nconst __jait_require=__jait_createRequire(__jait_original_url);\nconst __jait_original_dir=__jait_fileURLToPath(new URL('.',__jait_original_url));\nconst __jait_fixture_dir=__jait_fileURLToPath(new URL('../../../../.jait/artifacts/gateway-rust-readiness/tailstatic-fixtures/',import.meta.url));\n${shared}\nexport async function run(name: string): Promise<unknown> {\n await __jait_mkdir(__jait_fixture_dir,{recursive:true});\n const __jait_observations: any[]=[];\n const __jait_record=(row:any)=>{__jait_observations.push(row);__jait_observe(row)};\n const __jait_refs=new WeakMap<object,number>(); let __jait_nextRef=1;\n const __jait_ref=(v:any)=>{if((typeof v!=='object'||v===null)&&typeof v!=='function')return null;let n=__jait_refs.get(v);if(!n){n=__jait_nextRef++;__jait_refs.set(v,n)}return n};\n const __jait_capture=(slot:number,actual:any,...other:any[])=>{const row:any={slot,actual:__jait_boxed(actual),ref:__jait_ref(actual)};if(Array.isArray(actual)||actual instanceof Set)row.itemRefs=Array.from(actual,__jait_ref);if(other.length){row.other=__jait_boxed(other[0]);row.otherRef=__jait_ref(other[0])}__jait_record(row)};\n const __jait_captureType=(slot:number,actual:any)=>__jait_record({slot,actual:(typeof actual==='object'&&actual!==null)?{type:'object',value:{}}:__jait_boxed(actual)});\n const __jait_captureResolved=async(slot:number,p:Promise<unknown>,...other:any[])=>__jait_capture(slot,await p,...other);\n const __jait_errorRow=(slot:number,e:any,expected?:any)=>{const errorTypes=[],prototypes=[];let p=e&&typeof e==='object'?Object.getPrototypeOf(e):null;while(p){if(p.constructor?.name)errorTypes.push(p.constructor.name);prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}const identity=typeof expected==='function';if(identity&&(expected[Symbol.hasInstance]!==Function.prototype[Symbol.hasInstance]||expected.prototype===null||typeof expected.prototype!=='object'))throw new Error('unsupported exception constructor identity');return {slot,threw:true,error:String(e instanceof Error?e.message:e),errorTypes,...(identity?{prototypes,expectedPrototype:__jait_ref(expected.prototype)}:{})}};\n const __jait_thrown=(slot:number,fn:()=>unknown,...other:any[])=>{let row:any;try{fn();row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};\n const __jait_rejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{await p;row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};\n const __jait_captureRejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{const actual=await p;row={slot,threw:false,actual:__jait_boxed(actual)}}catch(e){row={...__jait_errorRow(slot,e,other[0]),actual:__jait_boxed(e)}}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};\n const __jait_instance=(slot:number,actual:any,expected:any,threw?:boolean)=>{const prototypes=[];let p=actual==null?null:Object.getPrototypeOf(actual);while(p){prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}__jait_record({slot,prototypes,expectedPrototype:__jait_ref(expected.prototype),...(threw===undefined?{}:{threw})})};\n const __jait_instanceRejected=async(slot:number,p:Promise<unknown>,expected:any)=>{let actual:any,threw=false;try{actual=await p}catch(e){actual=e;threw=true}__jait_instance(slot,actual,expected,threw)};\n switch(name){\n`;
 for(const c of group.cases){code+=`case ${JSON.stringify(c.id)}: {\n${c.body}\nbreak;\n}\n`;c.group=id;}
 code+=`default: throw new Error('unknown tailstatic fixture');\n }\n return __jait_observations;\n}\n`;
 fs.writeFileSync(`tests/contract/drivers/tailstatic/fixture-${id}.ts`,code);
}
// Drop fixtures whose source test disappeared, so the directory always mirrors
// the current source set exactly.
const fixtureNames=new Set(groups.map(group=>`fixture-${fixtureId(group.path)}.ts`));
for(const name of fs.readdirSync('tests/contract/drivers/tailstatic')){
 if(/^fixture.*\.ts$/.test(name)&&!fixtureNames.has(name))fs.rmSync(path.join('tests/contract/drivers/tailstatic',name));
}
const dispatch=[...fixtureNames].sort().map(name=>`case ${JSON.stringify(name.slice('fixture-'.length,-'.ts'.length))}: return await (await import('./tailstatic/${name}')).run(call.name);`).join('\n');
fs.writeFileSync('tests/contract/drivers/tailstatic.ts',`/** Isolated fixtures; all comparisons execute in Rust. */\nexport async function dispatch(call: any): Promise<unknown> {\n const log=console.log; console.log=(...args:unknown[])=>console.error(...args);\n try { switch(call.file){\n${dispatch}\n default: throw new Error('unknown tailstatic file');\n } } finally { console.log=log; }\n}\n`);
let rust=`//! Gateway assertion translations; Rust evaluates every verdict.\n#![allow(non_snake_case)]\n#[path = "support/tail_assertions.rs"]\nmod tail_assertions;\n`;
for(const g of groups)for(const c of g.cases)rust+=`\n// ${c.report.original}: ${c.report.name.replace(/\n/g,' ')}\n#[test]\n${c.attributes.length?c.attributes.join('\n')+'\n':''}fn ${c.id.toLowerCase()}() {\n tail_assertions::check(${rustString(c.group)}, ${rustString(c.id)}, ${rustString(JSON.stringify(c.rules))});\n}\n`;
fs.writeFileSync('tests/contract/tests/tail_static.rs',rust);
const localRustfmt=path.join(homedir(),'.cargo/bin',process.platform==='win32'?'rustfmt.exe':'rustfmt');
const formatted=spawnSync(process.env.RUSTFMT??(fs.existsSync(localRustfmt)?localRustfmt:'rustfmt'),['--edition','2024','tests/contract/tests/tail_static.rs'],{cwd:root,encoding:'utf8'});
if(formatted.error||formatted.status!==0)throw Error('Format generated Rust: '+(formatted.error?.message??formatted.stderr));
const report={lane:'tailstatic',verified:false,execution:'Generated only; run the Rust suite to validate this output',translatedDeclarations:declarations.filter(d=>d.status==='authored-unrun').length,rustTests:translated.length,ignoredTests:groups.reduce((n,g)=>n+g.cases.filter(c=>c.ignored).length,0),assertionSites:translated.reduce((n,c)=>n+c.rules.filter(rule=>rule.matcher!=='toComplete').length,0),completionGuards:translated.reduce((n,c)=>n+c.rules.filter(rule=>rule.matcher==='toComplete').length,0),platformGatedTests:groups.reduce((n,g)=>n+g.cases.filter(c=>c.attributes.some(a=>a.startsWith('#[cfg_attr'))).length,0),files:groups.map(g=>({path:g.path,translated:g.cases.length})),declarations};
const mappingDirectory=path.join(root,'.jait/artifacts/gateway-rust-readiness/parallel-flash/tailstatic');
fs.mkdirSync(mappingDirectory,{recursive:true});
fs.writeFileSync(path.join(mappingDirectory,'mapping-proposal.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(mappingDirectory,'claim.json'),JSON.stringify({ownerChat:'01a14702-48dc-7565-985d-f8ea3e00ed00',status:'authored-unrun',files:groups.map(g=>g.path),owns:['tests/contract/tests/tail_static.rs','tests/contract/tests/support/tail_assertions.rs','tests/contract/drivers/tailstatic.ts','tests/contract/drivers/tailstatic/']},null,2)+'\n');
console.log(JSON.stringify({translated:report.translatedDeclarations,rustTests:translated.length,ignoredTests:groups.reduce((n,g)=>n+g.cases.filter(c=>c.ignored).length,0),assertionSites:report.assertionSites,completionGuards:report.completionGuards,platformGatedTests:report.platformGatedTests,files:groups.length,gaps:declarations.filter(d=>d.status==='gap').length}));

