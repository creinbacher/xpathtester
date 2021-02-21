import * as vscode from "vscode";
import { getNonce } from "./getNonce";
import { Query, QueryResult } from "./types";
import { XPathWrapper } from "./XPathWrapper";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;
  xpathOut: vscode.OutputChannel;

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
  ) {
    this.xpathOut = vscode.window.createOutputChannel("XPath");
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
          break;
        }
      }
    });
  }

  private checkXPath(query: Query) {
    if (!query.expression) {
      vscode.window.showInformationMessage("Please enter an expression");
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

    let queryResult: QueryResult[];
    try {
      queryResult = this.xpathWrapper.checkXPath(query, xml);
      this.updateDecorations(queryResult);
    } catch (e) {
      vscode.window.showInformationMessage(e.message);
    }
  }

  private addDecoration(
    activeTextEditor: vscode.TextEditor,
    startPosition: number,
    endPosition: number,
    result: QueryResult,
    xpathResults: vscode.DecorationOptions[]
  ) {
    const startPos = activeTextEditor.document.positionAt(startPosition);
    const endPos = activeTextEditor.document.positionAt(endPosition);

    const decoration = {
      range: new vscode.Range(startPos, endPos),
      hoverMessage:
        "Node **" +
        result.foundNode.nodeName +
        "** is of NodeType **" +
        result.foundNode.nodeType +
        "**",
    };
    xpathResults.push(decoration);
  }

  private applyDecorations(
    activeTextEditor: vscode.TextEditor,
    match: number,
    text: string,
    result: QueryResult,
    xpathResults: vscode.DecorationOptions[]
  ) {
    if (
      "Element" === result.foundNode.nodeType &&
      result.foundNode.childNodes
    ) {
      // calculate decoration for opening and closing tags
      this.addDecoration(
        activeTextEditor,
        match,
        text.indexOf(">", match) + 1,
        result,
        xpathResults
      );

      if (result.foundNode.textContent) {
        //closing tags
        const startPosition = this.findIndexOfTag(
          text,
          "</" + result.foundNode.tagName,
          match
        );
        this.addDecoration(
          activeTextEditor,
          startPosition,
          text.indexOf(">", startPosition) + 1,
          result,
          xpathResults
        );
      }
    } else {
      this.addDecoration(
        activeTextEditor,
        match,
        match + result.foundNode.textContent.length,
        result,
        xpathResults
      );
    }
  }

  private findIndexOfTag(
    textToSearchIn: string,
    tagToFind: string,
    startIndex: number
  ): number {
    let foundIndex = textToSearchIn.indexOf(tagToFind, startIndex);
    while (foundIndex > -1) {
      //only when the text at found index ends in a space or > we really found the tag
      let nextCharacter = textToSearchIn.substr(
        foundIndex + tagToFind.length,
        1
      );
      if (" " === nextCharacter || ">" === nextCharacter) {
        return foundIndex;
      }
      foundIndex = textToSearchIn.indexOf(tagToFind, foundIndex + 1);
    }
    return -1;
  }

  private updateDecorationsForNode(
    result: QueryResult,
    startOfContextNodeInDom: number,
    endOfContextNode: number,
    text: string,
    textAsDom: string,
    activeTextEditor: vscode.TextEditor,
    xpathResults: vscode.DecorationOptions[]
  ) {
    //depending on the indexInContext we have to highlight the correct node
    if (
      undefined === result.foundNode.indexInContext ||
      result.foundNode.indexInContext < 0 ||
      undefined === result.contextNode?.numberOfNodesInContext
    ) {
      return;
    }
    let match = textAsDom.indexOf(
      result.foundNode.textContent,
      startOfContextNodeInDom
    );
    let nextMatch = textAsDom.indexOf(result.foundNode.textContent, match + 1);
    if (nextMatch < 0) {
      //we only have one match => apply decorations
      match = this.findIndexOfTag(text, "<" + result.foundNode.tagName, match);
      this.applyDecorations(
        activeTextEditor,
        match,
        text,
        result,
        xpathResults
      );
      return;
    }
    let counter = 0;
    while (counter < result.contextNode.numberOfNodesInContext) {
      if (counter === result.foundNode.indexInContext) {
        match = this.findIndexOfTag(
          text,
          "<" + result.foundNode.tagName,
          match
        );
        if (match < endOfContextNode) {
          this.applyDecorations(
            activeTextEditor,
            match,
            text,
            result,
            xpathResults
          );
          return;
        }
      } else {
        match = textAsDom.indexOf(result.foundNode.textContent, match + 1);
        counter++;
      }
    }
  }

  private updateDecorations(queryResult: QueryResult[]) {
    const { activeTextEditor } = vscode.window;

    if (!activeTextEditor) {
      return;
    }

    const text: string = activeTextEditor.document.getText();
    const textAsDom: string = this.xpathWrapper.getDomAsString(text);
    const xpathResults: vscode.DecorationOptions[] = [];

    let match: number;
    queryResult.forEach((result) => {
      if (result.contextNode) {
        this.xpathOut.appendLine(
          "Context-Node at line: " + result.contextNode.lineNumber
        );
        //we need to search for children only inside the context node
        let startOfContextNodeInDom = textAsDom.indexOf(
          result.contextNode.textContent,
          0
        );
        let startOfContextNode = this.findIndexOfTag(
          text,
          "<" + result.contextNode.tagName,
          startOfContextNodeInDom
        );
        let endOfContextNode = this.findIndexOfTag(
          text,
          "</" + result.contextNode.tagName,
          startOfContextNode
        );

        this.updateDecorationsForNode(
          result,
          startOfContextNodeInDom,
          endOfContextNode,
          text,
          textAsDom,
          activeTextEditor,
          xpathResults
        );
      } else {
        match = textAsDom.indexOf(result.foundNode.textContent);
        while (match > -1) {
          //we need to reset match because it can differ from the content of the window to how it is represented in the dom
          match = this.findIndexOfTag(
            text,
            "<" + result.foundNode.tagName,
            match
          );
          this.applyDecorations(
            activeTextEditor,
            match,
            text,
            result,
            xpathResults
          );

          const foundLastIndex = this.findIndexOfTag(
            text,
            "</" + result.foundNode.tagName,
            match
          );
          match = textAsDom.indexOf(
            result.foundNode.textContent,
            foundLastIndex
          );
        }
      }
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
