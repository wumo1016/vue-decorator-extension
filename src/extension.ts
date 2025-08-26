import * as vscode from 'vscode'
import { pascalCase } from 'change-case'

import { parseVueClassComponents } from './parser'

export function activate(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerDefinitionProvider(
    { language: 'vue' },
    {
      provideDefinition(document, position) {
        const wordRange = document.getWordRangeAtPosition(
          position,
          /[\<\/][A-Za-z0-9_-]+/
        )
        if (!wordRange) return null
        const word = pascalCase(document.getText(wordRange).slice(1))
        const filePath = document.uri.fsPath
        const rootDir = vscode.workspace.getWorkspaceFolder(
          vscode.Uri.file(filePath)
        )?.uri?.fsPath
        const map = parseVueClassComponents(filePath, rootDir)
        if (map[word]) {
          return new vscode.Location(
            vscode.Uri.file(map[word]),
            new vscode.Position(0, 0)
          )
        }
        return null
      }
    }
  )

  context.subscriptions.push(provider)
}

export function deactivate() {}
