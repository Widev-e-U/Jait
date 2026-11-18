// Build-time review aid only. The native runtime embeds the committed SQL plan.
import ts from '../../../node_modules/typescript/lib/typescript.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const sourcePath = fileURLToPath(new URL('../../gateway/src/db/migrations.ts', import.meta.url));
const outputPath = fileURLToPath(new URL('../src/db/migrations.json', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
let array;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'migrations') array = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
if (!array || !ts.isArrayLiteralExpression(array)) throw new Error('migration array missing');
function exec(statement, ignored = false) {
  if (ts.isTryStatement(statement)) {
    if (statement.finallyBlock || statement.catchClause?.block.statements.length) throw new Error('nonempty catch requires native review');
    return statement.tryBlock.statements.flatMap(s => exec(s, true));
  }
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) throw new Error(`unsupported migration statement: ${statement.getText(ast).slice(0,100)}`);
  const call = statement.expression;
  if (call.expression.getText(ast) !== 'db.exec' || call.arguments.length !== 1) throw new Error('unsupported SQL call');
  const arg = call.arguments[0];
  if (!ts.isStringLiteral(arg) && !ts.isNoSubstitutionTemplateLiteral(arg)) throw new Error('dynamic SQL requires native review');
  return [{ kind: 'sql', sql: arg.text, ignore_errors: ignored }];
}
const migrations = array.elements.map(element => {
  if (!ts.isObjectLiteralExpression(element)) throw new Error('migration must be object');
  const property = name => element.properties.find(p => p.name?.getText(ast) === name);
  const id = Number(property('id')?.initializer?.getText(ast));
  const name = property('name')?.initializer?.text;
  const body = property('run')?.body;
  if (!Number.isSafeInteger(id) || !name || !body) throw new Error('migration metadata missing');
  let operations;
  if (id === 21) {
    operations = body.statements.slice(0, 6).filter(s => !ts.isTypeAliasDeclaration(s)).flatMap(s => exec(s));
    operations.push({ kind: 'backfill_workspaces' });
  } else if (id === 37) operations = [{ kind: 'rename_projects' }];
  else if (id === 62) operations = [{ kind: 'deduplicate_repositories' }, ...exec(body.statements.at(-1))];
  else operations = body.statements.flatMap(s => exec(s));
  return { id, name, operations };
}).sort((a,b) => a.id-b.id);
if (new Set(migrations.map(m => m.id)).size !== migrations.length) throw new Error('duplicate migration IDs');
const connectionSource = readFileSync(new URL('../../gateway/src/db/connection.ts', import.meta.url), 'utf8');
const connectionAst = ts.createSourceFile('connection.ts', connectionSource, ts.ScriptTarget.Latest, true);
let columns;
function findColumns(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(connectionAst) === 'expectedColumns') columns = node.initializer;
  ts.forEachChild(node, findColumns);
}
findColumns(connectionAst);
if (!columns || !ts.isObjectLiteralExpression(columns)) throw new Error('schema repair map missing');
const repairs = Object.fromEntries(columns.properties.map(table => {
  if (!ts.isPropertyAssignment(table) || !ts.isObjectLiteralExpression(table.initializer)) throw new Error('unsupported repair table');
  return [table.name.getText(connectionAst), Object.fromEntries(table.initializer.properties.map(column => {
    if (!ts.isPropertyAssignment(column) || !ts.isStringLiteral(column.initializer)) throw new Error('unsupported repair column');
    return [column.name.getText(connectionAst), column.initializer.text];
  }))];
}));
const plan = JSON.stringify({ format: 1, source_sha256: createHash('sha256').update(source).digest('hex'), repair_source_sha256: createHash('sha256').update(connectionSource).digest('hex'), repairs, migrations }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(outputPath, 'utf8') !== plan) throw new Error('native migration plan drift; review and regenerate');
} else writeFileSync(outputPath, plan);
console.log(`${migrations.length} native migration definitions ${process.argv.includes('--check') ? 'checked' : 'captured'}`);
