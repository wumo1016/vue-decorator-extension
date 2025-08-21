// @ts-nocheck
import ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs'

export interface ComponentMap {
  [name: string]: string // 组件名 -> 路径
}

/**
 * @author: wyb
 * @description: 解析类装饰器的类组件配置
 */
export function parseVueClassComponents(
  filePath: string,
  rootDir?: string
): ComponentMap {
  const componentsMap: ComponentMap = {}
  const code = fs.readFileSync(filePath, 'utf-8')
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )

  const tsConfig = loadTsConfig(rootDir) || {}

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
                      const symbolName = p.name.text
                      componentsMap[symbolName] = resolveImportPath({
                        rootDir,
                        sourceFile: sourceFile,
                        symbolName,
                        fileDir: path.dirname(filePath),
                        tsConfig
                      })
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

/**
 * @description: 获取导入路径
 */
function resolveImportPath({
  rootDir,
  tsConfig,
  sourceFile,
  symbolName,
  fileDir
}: {
  rootDir: string
  sourceFile: ts.SourceFile
  symbolName: string
  fileDir: string
  tsConfig
}) {
  let moduleText = ''
  sourceFile.statements.forEach(stmt => {
    if (ts.isImportDeclaration(stmt)) {
      const importClause = stmt.importClause
      if (importClause && importClause.name?.text === symbolName) {
        moduleText = (stmt.moduleSpecifier as ts.StringLiteral).text
      } else if (
        importClause &&
        importClause.namedBindings &&
        ts.isNamedImports(importClause.namedBindings)
      ) {
        importClause.namedBindings.elements.forEach(el => {
          if (el.name.text === symbolName) {
            moduleText = (stmt.moduleSpecifier as ts.StringLiteral).text
          }
        })
      }
    }
  })
  if (moduleText) {
    return resolveFilePath({
      rootDir,
      tsConfig,
      fileDir,
      filePath: moduleText
    })
  }
  return moduleText
}

/**
 * @description: 解析文件路径
 */
function resolveFilePath({
  rootDir,
  tsConfig,
  fileDir,
  filePath
}: {
  rootDir: string
  tsConfig: Object
  filePath: string
}) {
  const baseUrl = tsConfig.baseUrl
    ? path.resolve(rootDir, tsConfig.baseUrl)
    : rootDir

  if (tsConfig.paths) {
    for (const [alias, targets] of Object.entries(tsConfig.paths)) {
      const prefix = alias.replace('/*', '')
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length)
        const target = targets[0].replace('/*', rest)
        return path.resolve(baseUrl, target)
      }
    }
  }

  return path.resolve(fileDir, filePath)
}

/**
 * @description: 加载 ts 配置
 * @param {string} rootDir
 */
function loadTsConfig(rootDir: string) {
  if (!rootDir) return
  const tsconfigPath = path.resolve(rootDir, 'tsconfig.json')
  if (!fs.existsSync(tsconfigPath)) return null
  const raw = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8')) as TsConfig
  return raw.compilerOptions ?? {}
}
