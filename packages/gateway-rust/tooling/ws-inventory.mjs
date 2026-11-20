// WebSocket candidates from the Node gateway, read with the TypeScript compiler API instead of regular expressions.
// Inbound candidates are the string arms of the hub's `switch (msg.type)`. Outbound candidates are the literal `type`
// values of object literals, so quoted keys, multi-line objects and conditional values are read, while comments,
// strings and interface fields are not. Literal types passed to a `broadcast*` helper are read from the call.
// Values that are not literals are returned as dynamic sites with the calls that enclose them, never dropped;
// api-inventory.mjs requires a reviewed reason for every dynamic site inside a send path.
// These are candidates, not proof of runtime parity. Hook-bus events (`hooks.emit`) are not frames and are not read.
import ts from 'typescript';

export function parseTs(fileName, text) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

// Removes parentheses and type casts (`as`, `satisfies`, `<T>`, `!`) around an expression.
function unwrap(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

const isStringValue = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

// Classifies one `type` value into literals, `prefix.${variable}` templates or dynamic sites.
function classifyTypeValue(expression, sf, calls, out) {
  const node = unwrap(expression);
  if (isStringValue(node)) {
    out.literals.push({ value: node.text, line: lineOf(sf, node) });
  } else if (ts.isConditionalExpression(node)) {
    classifyTypeValue(node.whenTrue, sf, calls, out);
    classifyTypeValue(node.whenFalse, sf, calls, out);
  } else if (
    ts.isTemplateExpression(node) &&
    node.templateSpans.length === 1 &&
    node.head.text.endsWith('.') &&
    node.templateSpans[0].literal.text === '' &&
    ts.isIdentifier(unwrap(node.templateSpans[0].expression))
  ) {
    out.templates.push({
      prefix: node.head.text.slice(0, -1),
      variable: unwrap(node.templateSpans[0].expression).text,
      line: lineOf(sf, node),
    });
  } else {
    out.dynamic.push({ text: node.getText(sf), line: lineOf(sf, node), calls });
  }
}

const isTypeKey = (name) => (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === 'type';
const calleeText = (call, sf) => call.expression.getText(sf).slice(0, 60);

// Every `type` property of an object literal in one source file (`{ type: ... }`, `{ "type": ... }`, `{ type }`).
// Each dynamic site carries `calls`, the callee text of every call that encloses it, so a frame sent by
// `this.send(ws, { type: x })` or `ws.send(JSON.stringify({ type: x }))` is recognisable.
export function objectTypeValues(sf) {
  const out = { literals: [], templates: [], dynamic: [] };
  const visit = (node, calls) => {
    let inner = calls;
    if (ts.isCallExpression(node)) inner = [...calls, calleeText(node, sf)];
    if (ts.isPropertyAssignment(node) && isTypeKey(node.name) && ts.isObjectLiteralExpression(node.parent)) {
      classifyTypeValue(node.initializer, sf, inner, out);
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'type') {
      out.dynamic.push({ text: 'type', line: lineOf(sf, node), calls: inner });
    }
    ts.forEachChild(node, (child) => visit(child, inner));
  };
  visit(sf, []);
  return out;
}

// The `case` clauses of every `switch` whose discriminant text is `discriminant`. Each clause is a literal arm or a
// dynamic arm; `relayed` lists the literal arms whose body calls this.relayShareSignal(...), which forwards the frame.
export function switchArms(sf, discriminant) {
  const out = { literals: [], dynamic: [], relayed: [] };
  const visit = (node) => {
    if (ts.isSwitchStatement(node) && node.expression.getText(sf) === discriminant) {
      for (const clause of node.caseBlock.clauses) {
        if (!ts.isCaseClause(clause)) continue;
        const arm = unwrap(clause.expression);
        if (!isStringValue(arm)) {
          out.dynamic.push({ text: arm.getText(sf), line: lineOf(sf, clause) });
          continue;
        }
        out.literals.push({ value: arm.text, line: lineOf(sf, clause) });
        if (clauseCallsRelay(clause, sf)) out.relayed.push(arm.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function clauseCallsRelay(clause, sf) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node) && node.expression.getText(sf) === 'this.relayShareSignal') found = true;
    else ts.forEachChild(node, visit);
  };
  clause.statements.forEach((statement) => visit(statement));
  return found;
}

// String arguments of `broadcast*(...)` helper calls, such as `broadcast(userId, "chat.moved", payload)`. The helper
// writes its argument as the frame type, so the literal is a frame type even though no `type:` property names it.
export function broadcastHelperLiterals(sf) {
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(sf);
      if (/^broadcast\w*$/.test(callee)) {
        for (const arg of node.arguments) {
          if (isStringValue(arg)) out.push({ value: arg.text, line: lineOf(sf, arg), callee });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// Lexical candidates for the hub: `nodeSource` is the text of packages/gateway/src/ws.ts and `rustSource` the Rust hub.
// Kept for the generator's unit tests; api-inventory.mjs builds the full list from every gateway source.
export function websocketCandidates(nodeSource, rustSource) {
  const sf = parseTs('ws.ts', nodeSource);
  const inbound = new Set(switchArms(sf, 'msg.type').literals.map((arm) => arm.value));
  const outbound = new Set(objectTypeValues(sf).literals.map((arm) => arm.value));
  const rustInbound = new Set();
  for (const arm of rustSource.matchAll(/("(?:[a-z][\w.:-]*)"(?:\s*\|\s*"(?:[a-z][\w.:-]*)")*)\s*=>/g)) {
    for (const value of arm[1].matchAll(/"([a-z][\w.:-]*)"/g)) rustInbound.add(value[1]);
  }
  const rustOutbound = new Set([...rustSource.matchAll(/["']type["']\s*:\s*["']([a-z][\w.:-]*)["']/g)].map((m) => m[1]));
  return [
    ...[...inbound].map((type) => ({ type, direction: 'client-to-server-candidate', rustReference: rustInbound.has(type) })),
    ...[...outbound].map((type) => ({ type, direction: 'server-to-client-candidate', rustReference: rustOutbound.has(type) })),
  ].sort((a, b) => a.direction.localeCompare(b.direction) || a.type.localeCompare(b.type));
}
