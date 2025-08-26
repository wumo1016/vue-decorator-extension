import * as ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs'

/**
 * @description: 递归查找导入文件
 */
export function resolveImportRecursive({
  symbolName,
  filePath,
  modulePath,
  compilerOptions,
  resolveFilePath
}: {
  symbolName: string
  filePath: string
  modulePath: string
  compilerOptions: ts.CompilerOptions
  resolveFilePath: Function
}) {
  modulePath = resolveFilePath(path.dirname(filePath), modulePath)

  const moduleAbsPath = modulePath.endsWith('.vue')
    ? modulePath
    : ts.resolveModuleName(
        resolveFilePath(path.dirname(filePath), modulePath),
        filePath,
        compilerOptions,
        ts.sys
      ).resolvedModule?.resolvedFileName

  console.log(
    '🚀 ~ resolveImportRecursive ~ moduleAbsPath:',
    modulePath,
    filePath,
    moduleAbsPath
  )

  if (!moduleAbsPath) {
    return
  }

  // 读取文件 AST
  const code = fs.readFileSync(moduleAbsPath, 'utf-8')
  // console.log('🚀 ~ resolveImportRecursive ~ code:', code)

  const sourceFile = ts.createSourceFile(
    moduleAbsPath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )

  // console.log('🚀 ~ resolveImportRecursive ~ sourceFile:', sourceFile)

  if (!sourceFile) return

  // 收集 import
  const importMap = new Map() // name -> resolved path
  sourceFile.forEachChild(node => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause &&
      node.moduleSpecifier
    ) {
      const modulePath = (node.moduleSpecifier as ts.StringLiteral).text
      if (node.importClause.name) {
        // 默认导入 import A from './a/index.vue'
        const localName = node.importClause.name.text
        importMap.set(
          localName,
          resolveFilePath(path.dirname(moduleAbsPath), modulePath)
        )
      } else if (
        node.importClause.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        // 具名导入 import { A } from './a'
        node.importClause.namedBindings.elements.forEach(el => {
          importMap.set(
            el.name.text,
            resolveFilePath(path.dirname(moduleAbsPath), modulePath)
          )
        })
      }
      // TODO: 别名导入
    }
  })

  // 解析 export
  for (const stmt of sourceFile.statements) {
    // export default A
    if (ts.isExportAssignment(stmt) && ts.isIdentifier(stmt.expression)) {
      const localName = stmt.expression.text
      if (localName === symbolName) {
        const target = importMap.get(localName)
        if (target.endsWith('.vue')) {
          return target
        }
        return resolveImportRecursive({
          symbolName: localName,
          filePath: moduleAbsPath,
          modulePath: target,
          compilerOptions,
          resolveFilePath
        })
      }
    }

    // 是否是导出语句
    if (!ts.isExportDeclaration(stmt)) continue

    // 是否是从某个文件导出的 是否有 from
    if (stmt.moduleSpecifier) {
      const moduleText = (stmt.moduleSpecifier as ts.StringLiteral).text
      // 导出的符号列表 export { A } from 'xxx'
      if (stmt.exportClause) {
        // console.log('🚀 ~ resolveImportRecursive ~ moduleText1:', moduleText)
        if (ts.isNamedExports(stmt.exportClause)) {
          for (const el of stmt.exportClause.elements) {
            // 别名导出 export { B as A } from 'xxx'
            // 别名
            const exportName = el.name.text
            // 导入名
            const localName = el.propertyName?.text ?? exportName
            if (exportName === symbolName || localName === symbolName) {
              // export { default as A } from 'xxx.vue'
              if (moduleText.endsWith('.vue')) {
                return path.resolve(path.dirname(moduleAbsPath), moduleText)
              }
              return resolveImportRecursive({
                symbolName: localName || exportName,
                filePath: moduleAbsPath,
                modulePath: moduleText,
                compilerOptions,
                resolveFilePath
              })
            }
          }
          // export * as A from 'xxx.vue'
        } else if (ts.isNamespaceExport(stmt.exportClause)) {
          const exportName = stmt.exportClause.name.text
          if (exportName === symbolName) {
            // console.log(
            //   '🚀 ~ resolveImportRecursive ~ moduleText1-2:',
            //   stmt.exportClause.name.text,
            //   path.resolve(path.dirname(moduleAbsPath), moduleText)
            // )
            return path.resolve(path.dirname(moduleAbsPath), moduleText)
          }
        }
        // export * from 'xxx'
      } else {
        // console.log('🚀 ~ resolveImportRecursive ~ moduleText2:', moduleText)
        return resolveImportRecursive({
          symbolName,
          filePath: moduleAbsPath,
          modulePath: moduleText,
          compilerOptions,
          resolveFilePath
        })
      }
      // export { A }
    } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        // 别名导出 export { B as A }
        const exportName = el.name.text
        const localName = el.propertyName?.text ?? el.name.text
        if (exportName === symbolName || localName === symbolName) {
          const target = importMap.get(localName)
          if (target.endsWith('.vue')) {
            return target
          }
          // import { A } from '@xxx'
          return resolveImportRecursive({
            symbolName: exportName || localName,
            filePath: moduleAbsPath,
            modulePath: target,
            compilerOptions,
            resolveFilePath
          })
        }
      }
    }
  }

  if (moduleAbsPath.endsWith('.vue')) {
    return moduleAbsPath
  }
}
