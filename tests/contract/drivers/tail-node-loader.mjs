/** TypeScript loading only; verdicts and fixture selection remain in Rust. */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));

export function sourceReviewOverride(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string' || raw.length > 16384) throw new Error('Invalid source review override');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid source review override'); }
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'copy,source'
    || typeof value.source !== 'string' || typeof value.copy !== 'string'
    || !isAbsolute(value.source) || !isAbsolute(value.copy)) {
    throw new Error('Invalid source review override');
  }
  const source = realpathSync(value.source), copy = realpathSync(value.copy);
  const sourceRelative = relative(root, source).replaceAll('\\', '/');
  const copyRelative = relative(root, copy).replaceAll('\\', '/');
  if (!sourceRelative.startsWith('packages/gateway/') || sourceRelative.split('/').includes('..')
    || (copy !== source && !copyRelative.startsWith('.jait/artifacts/source-review/'))) {
    throw new Error('Source review override escapes fixture scope');
  }
  return source === copy ? null : { source, copy };
}

const review = sourceReviewOverride(process.env.JAIT_SOURCE_REVIEW_OVERRIDE);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.js')) {
    let url;
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) url = new URL(specifier, context.parentURL);
    else if (isAbsolute(specifier)) url = pathToFileURL(specifier);
    else if (specifier.startsWith('file:')) url = new URL(specifier);
    if (url) {
      const candidate = new URL(url.href.slice(0, -3) + '.ts');
      if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\.tsx?$/.test(new URL(url).pathname)) {
    const path = fileURLToPath(url);
    const redirected = review && realpathSync(path) === review.source;
    const bytes = readFileSync(redirected ? review.copy : path);
    if (redirected && bytes.length > 2 * 1024 * 1024) throw new Error('Source review copy exceeds size limit');
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(bytes.toString('utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
      fileName: path,
    }).outputText };
  }
  return nextLoad(url, context);
}
