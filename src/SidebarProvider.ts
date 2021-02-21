import * as vscode from "vscode";
import { getNonce } from "./getNonce";
import { Query, QueryResult, ResultNode } from "./types";
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
      if (!queryResult || queryResult.length === 0) {
        return;
      }
      if (queryResult.length === 1 && queryResult[0].numericResult) {
        this.xpathOut.appendLine(
          "The expression '" +
            query.expression +
            "' resulted in: " +
            queryResult[0].numericResult
        );
      } else {
        this.xpathOut.appendLine(
          "Found " +
            queryResult.length +
            " results for expression '" +
            query.expression +
            "'"
        );
        this.updateDecorations(queryResult);
      }
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
      this.isElementNodeType(result.foundNode.nodeType) &&
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
          match,
          result.foundNode
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
    startIndex: number,
    resultNode: ResultNode
  ): number {
    if (!this.isElementNodeType(resultNode.nodeType)) {
      //we don't have a tag - use textContent instead
      return textToSearchIn.indexOf(resultNode.textContent, startIndex);
    } else {
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
      match = this.findIndexOfTag(
        text,
        "<" + result.foundNode.tagName,
        match,
        result.foundNode
      );
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
    match = this.findIndexOfTag(
      text,
      "<" + result.foundNode.tagName,
      match,
      result.foundNode
    );
    while (counter < result.contextNode.numberOfNodesInContext) {
      if (match < endOfContextNode) {
        this.applyDecorations(
          activeTextEditor,
          match,
          text,
          result,
          xpathResults
        );
      } else {
        return;
      }

      match = text.indexOf(result.foundNode.textContent, match + 1);
      counter++;
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
          startOfContextNodeInDom,
          result.contextNode
        );
        let endOfContextNode = this.findIndexOfTag(
          text,
          "</" + result.contextNode.tagName,
          startOfContextNode,
          result.contextNode
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
        if (this.isElementNodeType(result.foundNode.nodeType)) {
          this.updateDecorationsForElementNode(
            result,
            textAsDom,
            text,
            activeTextEditor,
            xpathResults
          );
        } else {
          this.updateDecorationsForNonElementNode(
            result,
            textAsDom,
            text,
            activeTextEditor,
            xpathResults
          );
        }
      }
    });

    activeTextEditor.setDecorations(
      this.xpathResultDecorationType,
      this.removeDuplicateDecorations(xpathResults)
    );
  }

  private removeDuplicateDecorations(
    decorations: vscode.DecorationOptions[]
  ): vscode.DecorationOptions[] {
    let finalDecorations: vscode.DecorationOptions[] = [];
    let addedDecorations: string[] = [];
    decorations.forEach((decoration) => {
      const hash =
        decoration.range.start.line.toString() +
        ":" +
        decoration.range.start.character.toString() +
        ":" +
        decoration.range.end.line.toString() +
        ":" +
        decoration.range.end.character.toString() +
        ":" +
        decoration.hoverMessage;
      if (addedDecorations.indexOf(hash) > -1) {
        console.log("Found duplicate entry: " + hash);
      } else {
        addedDecorations.push(hash);
        finalDecorations.push(decoration);
      }
    });

    return finalDecorations;
  }

  private isElementNodeType(nodeType: string): boolean {
    return "Element" === nodeType;
  }

  private updateDecorationsForNonElementNode(
    result: QueryResult,
    textAsDom: string,
    text: string,
    activeTextEditor: vscode.TextEditor,
    xpathResults: vscode.DecorationOptions[]
  ) {
    console.log(
      "FoundNode is not of type Element but " + result.foundNode.nodeType
    );

    let match = text.indexOf(result.foundNode.textContent);
    while (match > -1) {
      this.applyDecorations(
        activeTextEditor,
        match,
        text,
        result,
        xpathResults
      );

      match = text.indexOf(result.foundNode.textContent, match + 1);
    }
  }

  private findMatch(
    textToSearch: string,
    textToFind: string,
    startPosition: number
  ): number {
    let match = textToSearch.indexOf(textToFind, startPosition);
    if (match > -1) {
      return match;
    }

    // if we haven't found a match yet - try again after removing namespaces from textToFind
    // first - remove all namspaces without prefix
    let namespaceStart = textToFind.indexOf('xmlns="');
    let namespaceEnd = -1;
    let namespace: string;
    while (namespaceStart > -1) {
      namespaceEnd = textToFind.indexOf('"', namespaceStart + 7); // +7 because we have to account for 'xmlns="'
      namespace = textToFind.substring(namespaceStart - 1, namespaceEnd + 1); //we start at namespaceStart-1 because of the spaces in front and back of the namespace
      console.log("Found namespaces in textToFind - removing: " + namespace);
      textToFind = textToFind.replace(namespace, "");

      namespaceStart = textToFind.indexOf('xmlns="');
    }

    //now check for namespaces with prefix
    namespaceStart = textToFind.indexOf("xmlns:");
    while (namespaceStart > -1) {
      namespaceEnd = textToFind.indexOf('="', namespaceStart + 1);
      namespaceEnd = textToFind.indexOf('"', namespaceEnd + 2); // +2 because we're at the = at this point
      namespace = textToFind.substring(namespaceStart - 1, namespaceEnd + 1);
      console.log("Found namespaces in textToFind - removing: " + namespace);
      textToFind = textToFind.replace(namespace, "");

      namespaceStart = textToFind.indexOf("xmlns:");
    }

    return textToSearch.indexOf(textToFind, startPosition);
  }

  private updateDecorationsForElementNode(
    result: QueryResult,
    textAsDom: string,
    text: string,
    activeTextEditor: vscode.TextEditor,
    xpathResults: vscode.DecorationOptions[]
  ) {
    let match = this.findMatch(textAsDom, result.foundNode.textContent, 0);
    while (match > -1) {
      //we need to reset match because it can differ from the content of the window to how it is represented in the dom
      match = this.findIndexOfTag(
        text,
        "<" + result.foundNode.tagName,
        match,
        result.foundNode
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
        match,
        result.foundNode
      );
      if (foundLastIndex < match) {
        this.xpathOut.appendLine(
          "Unable to apply highlighting for Node: " + result.foundNode.nodeName
        );
        return;
      }
      match = this.findMatch(
        textAsDom,
        result.foundNode.textContent,
        foundLastIndex + 1
      );
    }
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
