import * as vscode from "vscode";
import { getNonce } from "./getNonce";
import { Query } from "./types";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;

  private xpath = require("xpath");
  private dom = require("xmldom").DOMParser;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "onInfo": {
          if (!data.value) {
            return;
          }
          vscode.window.showInformationMessage(data.value);
          break;
        }
        case "onError": {
          if (!data.value) {
            return;
          }
          vscode.window.showErrorMessage(data.value);
          break;
        }
        case "onCheck": {
          if (!data.value) {
            return;
          }
          this.checkXPath(data.value);
          break;
        }
      }
    });
  }

  private checkXPath(query: Query) {
    if (!query.expression) {
      return;
    }
    const { activeTextEditor } = vscode.window;

    if (!activeTextEditor) {
      vscode.window.showInformationMessage("No active text editor");
      return;
    }

    const xml = activeTextEditor.document.getText();
    const doc = new this.dom().parseFromString(xml);

    if (query.contextnode) {
      this.evaluateXPath(query, doc);
    } else {
      this.selectXPath(query.expression, doc);
    }
  }

  private evaluateXPath(query: Query, doc: any) {
    let contextNodes = this.selectXPath(query.contextnode, doc);
    if (!contextNodes || contextNodes.length === 0) {
      vscode.window.showInformationMessage(
        "Epression not found in given XML document"
      );
    } else {
      contextNodes.forEach((contextNode) => {
        console.log("Node: " + contextNode.toString());

        var results = this.xpath.evaluate(
          "." + query.expression, // xpathExpression
          contextNode, // contextNode
          null, // namespaceResolver
          this.xpath.XPathResult.ANY_TYPE, // resultType
          null // result
        );

        console.log("Results: " + results.toString());
        if (!results) {
          vscode.window.showInformationMessage(
            "Epression not found for given XML document and context node"
          );
        } else {
          let result = results.iterateNext();
          while (result) {
            console.log("Result-Node: " + result.toString());

            result = results.iterateNext();
          }
        }
      });
    }
  }

  private selectXPath(expression: string, doc: any): any[] {
    const nodes = this.xpath.select(expression, doc);

    if (!nodes || nodes.length === 0) {
      vscode.window.showInformationMessage(
        "Epression not found in given XML document"
      );
    } else {
      console.log("Number of Nodes found: " + nodes.length);
      return nodes;
    }
    return [];
  }

  public revive(panel: vscode.WebviewView) {
    this._view = panel;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.css")
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out", "compiled/sidebar.js")
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleMainUri}" rel="stylesheet">
        <script nonce="${nonce}">
          const tsvscode = acquireVsCodeApi();
        </script>
			</head>
            <body>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }
}
