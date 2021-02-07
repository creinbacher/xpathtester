import * as vscode from "vscode";
import { getNonce } from "./getNonce";
import { Query } from "./types";
import { XPathWrapper } from "./XPathWrapper";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;

  private xpathResultDecorationType = vscode.window.createTextEditorDecorationType(
    {
      borderWidth: "1px",
      borderStyle: "solid",
      overviewRulerColor: "blue",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      light: {
        // this color will be used in light color themes
        borderColor: "darkblue",
        backgroundColor: "#FF000055",
      },
      dark: {
        // this color will be used in dark color themes
        borderColor: "lightblue",
        backgroundColor: "#FF000055",
      },
    }
  );

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly xpathWrapper: XPathWrapper
  ) {}

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

    activeTextEditor.setDecorations(this.xpathResultDecorationType, []);

    const xml = activeTextEditor.document.getText();
    if (!xml) {
      vscode.window.showInformationMessage(
        "Active text editor does not have content"
      );
      return;
    }

    let queryResult: string[];
    try {
      queryResult = this.xpathWrapper.checkXPath(query, xml);
      this.updateDecorations(queryResult);
    } catch (e) {
      vscode.window.showInformationMessage(e.message);
    }
  }

  private updateDecorations(queryResult: string[]) {
    const { activeTextEditor } = vscode.window;

    if (!activeTextEditor) {
      return;
    }
    const text = activeTextEditor.document.getText();
    const xpathResults: vscode.DecorationOptions[] = [];

    let match;
    queryResult.forEach((result) => {
      match = text.indexOf(result);
      const startPos = activeTextEditor.document.positionAt(match);
      const endPos = activeTextEditor.document.positionAt(
        match + result.length
      );

      const decoration = {
        range: new vscode.Range(startPos, endPos),
        hoverMessage: "Result **" + result + "**",
      };
      xpathResults.push(decoration);
    });

    activeTextEditor.setDecorations(
      this.xpathResultDecorationType,
      xpathResults
    );
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
