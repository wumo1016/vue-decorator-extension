// @ts-nocheck
import ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs'
import { resolveImportRecursive } from './resolveImportRecursive'

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

  const compilerOptions = getTsCompilerOptions(rootDir) || {}

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
                        filePath,
                        fileDir: path.dirname(filePath),
                        compilerOptions
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
  compilerOptions,
  sourceFile,
  symbolName,
  filePath,
  fileDir
}: {
  rootDir: string
  sourceFile: ts.SourceFile
  symbolName: string
  filePath: string
  fileDir: string
  compilerOptions
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
    if (!moduleText.endsWith('.vue')) {
      return resolveImportRecursive({
        symbolName,
        filePath: path.resolve(fileDir, filePath),
        modulePath: moduleText,
        compilerOptions: {
          ...compilerOptions,
          moduleResolution: ts.ModuleResolutionKind.Node10
        }
      })
    }
    return resolveFilePath({
      rootDir,
      compilerOptions,
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
  compilerOptions,
  fileDir,
  filePath
}: {
  rootDir: string
  compilerOptions: Object
  filePath: string
}) {
  const baseUrl = compilerOptions.baseUrl
    ? path.resolve(rootDir, compilerOptions.baseUrl)
    : rootDir

  if (compilerOptions.paths) {
    for (const [alias, targets] of Object.entries(compilerOptions.paths)) {
      const prefix = alias.replace('*', '')
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length)
        const target = targets[0].replace('*', rest)
        return path.resolve(baseUrl, target)
      }
    }
  }

  return path.resolve(fileDir, filePath)
}

/**
 * @description: 获取 ts 编译配置
 * @param {string} rootDir
 */
function getTsCompilerOptions(rootDir: string) {
  if (!rootDir) return
  const tsconfigPath = path.resolve(rootDir, 'tsconfig.json')
  if (!fs.existsSync(tsconfigPath)) return null
  const { config } = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  return config.compilerOptions ?? {}
}
