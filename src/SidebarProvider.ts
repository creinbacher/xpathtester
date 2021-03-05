import * as vscode from "vscode";
import { DecorationProcessor } from "./DecorationProcessor";
import { getNonce } from "./getNonce";
import { Query, QueryResult } from "./types";
import { XPathWrapper } from "./XPathWrapper";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;
  xpathOut: vscode.OutputChannel;
  resultDecorationTypes: vscode.TextEditorDecorationType;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly xpathWrapper: XPathWrapper
  ) {
    this.xpathOut = vscode.window.createOutputChannel("XPath");
    this.resultDecorationTypes = this.getResultDecorationType();
  }

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
          this.xpathOut.show();
          break;
        }
      }
    });
  }

  private checkXPath(query: Query) {
    if (!query.expression) {
      vscode.window.showInformationMessage("Please enter an expression");
      this.xpathOut.appendLine("Please enter an expression to start a check");
      return;
    }
    const { activeTextEditor } = vscode.window;

    if (!activeTextEditor) {
      vscode.window.showInformationMessage("No active text editor");
      this.xpathOut.appendLine(
        "Please make sure that you have a XML document open and active."
      );
      return;
    }

    activeTextEditor.setDecorations(this.resultDecorationTypes, []);

    const xml = activeTextEditor.document.getText();
    if (!xml) {
      vscode.window.showInformationMessage(
        "Active text editor does not have content"
      );
      this.xpathOut.appendLine(
        "Please make sure that you have a XML document open and active."
      );
      return;
    }

    let queryResult: QueryResult[];
    try {
      const startTime = new Date();
      this.xpathOut.clear();

      queryResult = this.xpathWrapper.checkXPath(query, xml);
      if (!queryResult || queryResult.length === 0) {
        let out = "Found no results for expression '" + query.expression;
        out += this.checkForContext(query.contextNode);
        out += "'";
        this.xpathOut.appendLine(out);
        return;
      }
      if (
        queryResult.length > 0 &&
        undefined !== queryResult[0].numericResult
      ) {
        let sumOfResults: number = 0;
        if (queryResult.length > 1) {
          //sum up all the numeric results
          queryResult.forEach((result) => {
            if (result.numericResult) {
              sumOfResults += result.numericResult;
            }
          });
        } else {
          sumOfResults = queryResult[0].numericResult;
        }
        let out = "The expression '" + query.expression;
        out += this.checkForContext(query.contextNode);
        out += "' resulted in: " + sumOfResults;
        this.xpathOut.appendLine(out);
      } else {
        let out =
          "Found " +
          queryResult.length +
          " results for expression '" +
          query.expression;
        out += this.checkForContext(query.contextNode);
        out += "'";
        this.xpathOut.appendLine(out);
        this.updateDecorations(queryResult);
        this.printDuration(query.expression, query.contextNode, startTime);
      }
    } catch (e) {
      vscode.window.showInformationMessage(e.message);
      console.error(e);
    }
  }

  private checkForContext(context: string): string {
    if (context && "" !== context) {
      return "' within context '" + context;
    }
    return "";
  }

  private printDuration(expression: string, context: string, startTime: Date) {
    const duration = new Date().getTime() - startTime.getTime();

    let durationText = "The expression '" + expression;
    durationText += this.checkForContext(context);
    durationText += "' took " + duration / 1000 + " seconds to evaluate";
    this.xpathOut.appendLine(durationText);
  }

  private updateDecorations(queryResult: QueryResult[]) {
    const { activeTextEditor } = vscode.window;

    if (!activeTextEditor) {
      return;
    }
    const text: string = activeTextEditor.document.getText();
    const decorationProcesser = new DecorationProcessor(this.xpathOut);
    const xpathResults: vscode.DecorationOptions[] = decorationProcesser.collectDecorationsV2(
      queryResult
    );

    activeTextEditor.setDecorations(this.resultDecorationTypes, xpathResults);
  }

  private getResultDecorationType(): vscode.TextEditorDecorationType {
    const config = vscode.workspace.getConfiguration("xpathtester");

    return vscode.window.createTextEditorDecorationType({
      borderWidth: config.get("styling.borderWidth"),
      borderStyle: config.get("styling.borderStyle"),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      light: {
        // this color will be used in light color themes
        overviewRulerColor: config.get("styling.lightTheme.overviewRulerColor"),
        borderColor: config.get("styling.lightTheme.borderColor"),
        backgroundColor: config.get("styling.lightTheme.backgroundColor"),
      },
      dark: {
        // this color will be used in dark color themes
        overviewRulerColor: config.get("styling.darkTheme.overviewRulerColor"),
        borderColor: config.get("styling.darkTheme.borderColor"),
        backgroundColor: config.get("styling.darkTheme.backgroundColor"),
      },
    });
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
