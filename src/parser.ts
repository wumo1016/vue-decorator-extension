// @ts-nocheck

import ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs'

export interface ComponentMap {
  [name: string]: string // 组件名 -> 路径
}

export function parseVueClassComponents(filePath: string): ComponentMap {
  const componentsMap: ComponentMap = {}

  const code = fs.readFileSync(filePath, 'utf-8')

  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )

  sourceFile.forEachChild(node => {
    if (ts.isClassDeclaration(node)) {
      const decorators = ts.getDecorators?.(node) || []
      decorators.forEach(decorator => {
        const call = decorator.expression
        if (
          ts.isIdentifier(call.expression) &&
          call.expression.text === 'Options'
        ) {
          const arg = call.arguments?.[0]
          if (arg && ts.isObjectLiteralExpression(arg)) {
            for (const prop of arg.properties) {
              if (
                ts.isPropertyAssignment(prop) &&
                prop.name.text === 'components'
              ) {
                if (ts.isObjectLiteralExpression(prop.initializer)) {
                  for (const p of prop.initializer.properties) {
                    if (ts.isShorthandPropertyAssignment(p)) {
                      const compName = p.name.text
                      componentsMap[compName] = resolveImportPath(
                        sourceFile,
                        compName,
                        path.dirname(filePath)
                      )
                    }
                  }
                }
              }
            }
          }
        }
      })
    }
  })
  return componentsMap
}

function resolveImportPath(
  sourceFile: ts.SourceFile,
  symbolName: string,
  dir: string
) {
  let pathFound = ''
  sourceFile.statements.forEach(stmt => {
    if (ts.isImportDeclaration(stmt)) {
      const importClause = stmt.importClause
      if (importClause && importClause.name?.text === symbolName) {
        const moduleText = (stmt.moduleSpecifier as ts.StringLiteral).text
        pathFound = path.resolve(dir, moduleText)
      } else if (
        importClause &&
        importClause.namedBindings &&
        ts.isNamedImports(importClause.namedBindings)
      ) {
        importClause.namedBindings.elements.forEach(el => {
          if (el.name.text === symbolName) {
            const moduleText = (stmt.moduleSpecifier as ts.StringLiteral).text
            pathFound = path.resolve(dir, moduleText)
          }
        })
      }
    }
  })
  return pathFound
}
