// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { SidebarProvider } from "./SidebarProvider";
import { XPathWrapper } from "./XPathWrapper";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    new XPathWrapper()
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "xpathtester-sidebar",
      sidebarProvider
    )
  );

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "xpathtester" is now active!');
}

// this method is called when your extension is deactivated
export function deactivate() {}
