import { getHeapStatistics } from "v8";
import * as vscode from "vscode";
import { QueryResult, ResultNode } from "./types";
export class DecorationProcessor {
  private text: string;
  private textAsDom: string;
  private xpathOut: vscode.OutputChannel;
  private activeTextEditor: vscode.TextEditor;

  constructor(
    text: string,
    textAsDom: string,
    xpathOut: vscode.OutputChannel,
    activeTextEditor: vscode.TextEditor
  ) {
    this.text = text;
    this.textAsDom = textAsDom;
    this.xpathOut = xpathOut;
    this.activeTextEditor = activeTextEditor;
  }

  public collectDecorations(
    queryResult: QueryResult[]
  ): vscode.DecorationOptions[] {
    const xpathResults: vscode.DecorationOptions[] = [];

    queryResult.forEach((result) => {
      if (result.contextNode) {
        //we need to search for children only inside the context node
        let startOfContextNodeInDom = this.textAsDom.indexOf(
          result.contextNode.textContent,
          0
        );
        let startOfContextNode = this.findIndexOfTag(
          this.text,
          "<" + result.contextNode.tagName,
          startOfContextNodeInDom,
          result.contextNode
        );
        let endOfContextNode = this.findIndexOfTag(
          this.text,
          "</" + result.contextNode.tagName,
          startOfContextNode,
          result.contextNode
        );

        this.updateDecorationsForNode(
          result,
          startOfContextNodeInDom,
          endOfContextNode,
          this.text,
          this.textAsDom,
          xpathResults
        );
      } else {
        if (this.isElementNodeType(result.foundNode.nodeType)) {
          this.updateDecorationsForElementNode(
            result,
            this.textAsDom,
            this.text,
            xpathResults
          );
        } else {
          this.updateDecorationsForNonElementNode(
            result,
            this.textAsDom,
            this.text,
            xpathResults
          );
        }
      }
    });

    return this.removeDuplicateDecorations(xpathResults);
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

  private updateDecorationsForNode(
    result: QueryResult,
    startOfContextNodeInDom: number,
    endOfContextNode: number,
    text: string,
    textAsDom: string,
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
      this.applyDecorations(match, text, result, xpathResults);
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
        this.applyDecorations(match, text, result, xpathResults);
      } else {
        return;
      }

      match = text.indexOf(result.foundNode.textContent, match + 1);
      counter++;
    }
  }

  private updateDecorationsForNonElementNode(
    result: QueryResult,
    textAsDom: string,
    text: string,
    xpathResults: vscode.DecorationOptions[]
  ) {
    console.log(
      "FoundNode is not of type Element but " + result.foundNode.nodeType
    );

    let match = text.indexOf(result.foundNode.textContent);
    while (match > -1) {
      this.applyDecorations(match, text, result, xpathResults);

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
      this.applyDecorations(match, text, result, xpathResults);

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

  private applyDecorations(
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
          startPosition,
          text.indexOf(">", startPosition) + 1,
          result,
          xpathResults
        );
      }
    } else {
      this.addDecoration(
        match,
        match + result.foundNode.textContent.length,
        result,
        xpathResults
      );
    }
  }

  private addDecoration(
    startPosition: number,
    endPosition: number,
    result: QueryResult,
    xpathResults: vscode.DecorationOptions[]
  ) {
    const startPos = this.activeTextEditor.document.positionAt(startPosition);
    const endPos = this.activeTextEditor.document.positionAt(endPosition);

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

  private isElementNodeType(nodeType: string): boolean {
    return "Element" === nodeType;
  }
}
