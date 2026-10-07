#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(new URL('..', import.meta.url).pathname);

function extractLocaleKeys(file, exportedName = basename(file, '.ts'), visited = new Set()) {
  const identity = `${file}:${exportedName}`;
  if (visited.has(identity)) return new Set();
  visited.add(identity);
  const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const imports = new Map();
  let declaration;
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const specifier of statement.importClause.namedBindings.elements) {
        imports.set(specifier.name.text, { module: statement.moduleSpecifier.text, exported: specifier.propertyName?.text ?? specifier.name.text });
      }
    }
    if (ts.isVariableStatement(statement)) {
      declaration ??= statement.declarationList.declarations.find((entry) => ts.isIdentifier(entry.name) && entry.name.text === exportedName);
    }
  }
  const keys = new Set();
  const unwrap = (expression) => {
    while (expression && (ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression))) expression = expression.expression;
    return expression;
  };
  const initializer = unwrap(declaration?.initializer);
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) return keys;
  for (const property of initializer.properties) {
    if (ts.isPropertyAssignment(property) && (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name))) {
      if (property.name.text.includes('.')) keys.add(property.name.text);
    }
    if (ts.isSpreadAssignment(property)) {
      const expression = unwrap(property.expression);
      const imported = expression && ts.isIdentifier(expression) ? imports.get(expression.text) : undefined;
      if (!imported || !imported.module.startsWith('.')) continue;
      const importedKeys = extractLocaleKeys(resolve(dirname(file), `${imported.module}.ts`), imported.exported, visited);
      for (const key of importedKeys) keys.add(key);
    }
  }
  return keys;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!['node_modules', 'dist', '.git'].includes(entry)) walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function extractUsedKeys(files) {
  const used = new Map();
  const regex = /\bt\(\s*['"]([^'"]+)['"]/g;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    let match;
    while ((match = regex.exec(source))) {
      const key = match[1];
      // Only enforce dictionary-style keys. The legacy codebase still wraps many
      // literal UI strings in t("English text"), and those need a separate
      // migration instead of failing this foundational check.
      if (!/^[a-z][a-zA-Z0-9]*\./.test(key)) continue;
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(relative(root, file));
    }
  }
  return used;
}

const en = extractLocaleKeys(resolve(root, 'client/src/locales/en.ts'));
const el = extractLocaleKeys(resolve(root, 'client/src/locales/el.ts'));
const used = extractUsedKeys(walk(resolve(root, 'client/src')));

const missingInEn = [...used.keys()].filter((key) => !en.has(key)).sort();
const missingInEl = [...used.keys()].filter((key) => !el.has(key)).sort();
const localeMismatch = [
  ...[...el].filter((key) => !en.has(key)).map((key) => `missing in en: ${key}`),
  ...[...en].filter((key) => !el.has(key)).map((key) => `missing in el: ${key}`),
].sort();

if (missingInEn.length || missingInEl.length || localeMismatch.length) {
  console.error('i18n key check failed');
  if (missingInEn.length) {
    console.error('\nUsed keys missing in en.ts:');
    for (const key of missingInEn) console.error(`  - ${key} (${[...new Set(used.get(key))].join(', ')})`);
  }
  if (missingInEl.length) {
    console.error('\nUsed keys missing in el.ts:');
    for (const key of missingInEl) console.error(`  - ${key} (${[...new Set(used.get(key))].join(', ')})`);
  }
  if (localeMismatch.length) {
    console.error('\nLocale dictionary mismatch:');
    for (const item of localeMismatch) console.error(`  - ${item}`);
  }
  process.exit(1);
}

console.log(`i18n key check passed (${used.size} used keys, ${en.size} en keys, ${el.size} el keys)`);
