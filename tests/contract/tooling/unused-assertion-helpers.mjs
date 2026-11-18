import ts from 'typescript'

// Identifier references deliberately overestimate reachability: aliases, callback
// arguments, property names and shadowed names all retain a helper. Only a closed
// lexical graph without eval/Function can prove a helper unused for one case.
export function findUnusedAssertionHelpers(source, declarationLine, declarationColumn) {
  const file = ts.createSourceFile('original.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const walk = (node, predicate) => {
    const result = []
    function visit(child) {
      if (predicate(child)) result.push(child)
      ts.forEachChild(child, visit)
    }
    visit(node)
    return result
  }
  const testBase = expression => ts.isIdentifier(expression) && ['it', 'test'].includes(expression.text)
  const registrations = walk(file, node => ts.isCallExpression(node)
    && (testBase(node.expression) || ts.isCallExpression(node.expression)
      && ts.isPropertyAccessExpression(node.expression.expression)
      && node.expression.expression.name.text === 'each'
      && testBase(node.expression.expression.expression)
      && node.arguments.some(argument => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)))
    && (() => {
      const position = file.getLineAndCharacterOfPosition(node.getStart(file))
      return position.line + 1 === declarationLine && position.character + 1 === declarationColumn
    })())
  if (registrations.length !== 1) throw new Error('ambiguous test registration')
  const registration = registrations[0]
  const callback = registration.arguments.find(node => ts.isArrowFunction(node) || ts.isFunctionExpression(node))
  if (!callback || !ts.isBlock(callback.body)) throw new Error('unsupported test callback')
  const scopes = [file]
  for (let ancestor = registration.parent; ancestor && ancestor !== file; ancestor = ancestor.parent) {
    if ((ts.isArrowFunction(ancestor) || ts.isFunctionExpression(ancestor)) && ts.isBlock(ancestor.body)) scopes.push(ancestor.body)
    if (ts.isFunctionDeclaration(ancestor) || ts.isBlock(ancestor)
      && !(ts.isArrowFunction(ancestor.parent) || ts.isFunctionExpression(ancestor.parent))) {
      throw new Error('unsupported enclosing scope')
    }
    if (ts.isForStatement(ancestor) || ts.isForOfStatement(ancestor) || ts.isIfStatement(ancestor)) {
      throw new Error('conditional test registration')
    }
  }
  const definitions = new Map()
  const roots = [callback.body]
  function define(name, node) {
    if (definitions.has(name)) throw new Error('shadowed helper definition')
    definitions.set(name, node)
  }
  for (const scope of scopes) {
    for (const statement of scope.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
        define(statement.name.text, statement)
        if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) roots.push(statement)
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.initializer
            && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
            define(declaration.name.text, declaration.initializer)
            if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) roots.push(declaration)
          } else if (declaration.initializer) roots.push(declaration)
        }
      } else if (ts.isClassDeclaration(statement)) {
        roots.push(statement)
      } else if (ts.isExpressionStatement(statement)) {
        const expression = statement.expression
        if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
          && ['beforeEach', 'beforeAll', 'afterEach', 'afterAll'].includes(expression.expression.text)) {
          roots.push(...expression.arguments)
        } else if (!(ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
          && ['it', 'test', 'describe'].includes(expression.expression.text))) {
          // Unknown registration forms could expose a helper: fail closed.
          roots.push(statement)
        }
      } else if (!(ts.isImportDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
        || ts.isInterfaceDeclaration(statement) || ts.isEmptyStatement(statement))) {
        throw new Error('unsupported lexical setup')
      }
    }
  }
  const references = node => new Set(walk(node, ts.isIdentifier).map(identifier => identifier.text))
  const allNames = new Set([...roots, ...definitions.values()].flatMap(node => [...references(node)]))
  if (allNames.has('eval') || allNames.has('Function')) throw new Error('dynamic lexical lookup')
  const reachable = new Set()
  const queue = roots.flatMap(node => [...references(node)])
  while (queue.length) {
    const name = queue.pop()
    if (reachable.has(name) || !definitions.has(name)) continue
    reachable.add(name)
    queue.push(...references(definitions.get(name)))
  }
  const helpers = []
  for (const [name, node] of definitions) {
    if (reachable.has(name)) continue
    helpers.push({ name, start: node.getStart(file), end: node.end })
  }
  return {
    helpers,
    reachable: [...reachable].sort(),
    contains(start, end) {
      return helpers.find(helper => helper.start <= start && end <= helper.end)
    },
  }
}
