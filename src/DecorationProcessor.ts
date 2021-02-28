import * as vscode from "vscode";
import { Position } from "vscode";
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

  private collectDecorationElementNodeStart(
    result: QueryResult,
    xpathResults: vscode.DecorationOptions[]
  ) {
    const startIndexOpeningTag = result.foundNode.lineNumber - 1;
    const endIndexOpeningTag =
      result.foundNode.columnNumber + result.foundNode.textContent.indexOf(">");

    const startPosOpeningTag: Position = new Position(
      startIndexOpeningTag,
      result.foundNode.columnNumber - 1
    );

    const endPosOpeningTag: Position = new Position(
      startIndexOpeningTag,
      endIndexOpeningTag
    );

    xpathResults.push(
      this.createDecoration(result, startPosOpeningTag, endPosOpeningTag)
    );
  }

  private collectDecorationElementNodeEnd(
    result: QueryResult,
    xpathResults: vscode.DecorationOptions[]
  ) {
    const lineBreaks = this.countLineBreaks(result.foundNode.textContent);
    const startLineClosingTag = result.foundNode.lineNumber - 1 + lineBreaks;

    let startPosClosingTag: Position;
    let endPosClosingTag: Position;
    if (0 === lineBreaks) {
      let startIndexClosingTag =
        result.foundNode.columnNumber -
        1 +
        result.foundNode.textContent.indexOf("</" + result.foundNode.tagName);
      startPosClosingTag = new Position(
        startLineClosingTag,
        startIndexClosingTag
      );
      endPosClosingTag = new Position(
        startLineClosingTag,
        startIndexClosingTag +
          (result.foundNode.tagName ? result.foundNode.tagName.length : 0) +
          3
      );
    } else {
      startPosClosingTag = new Position(
        startLineClosingTag,
        result.foundNode.columnNumber - 1
      );
      endPosClosingTag = new Position(
        startLineClosingTag,
        result.foundNode.columnNumber -
          1 +
          (result.foundNode.tagName ? result.foundNode.tagName.length : 0) +
          3
      );
    }

    xpathResults.push(
      this.createDecoration(result, startPosClosingTag, endPosClosingTag)
    );
  }

  private countLineBreaks(text: string): number {
    let result: number = 0;
    let index = text.indexOf("\n");
    while (index > -1) {
      result++;
      index = text.indexOf("\n", index + 1);
    }

    return result;
  }

  private createDecoration(
    result: QueryResult,
    startPos: Position,
    endPos: Position
  ): vscode.DecorationOptions {
    return {
      range: new vscode.Range(startPos, endPos),
      hoverMessage:
        "Node **" +
        result.foundNode.nodeName +
        "** is of NodeType **" +
        result.foundNode.nodeType +
        "**",
    };
  }

  private calcEndIndexForTextNode(result: QueryResult): number {
    let splitted: string[] = result.foundNode.textContent.split("\n");
    if (splitted) {
      return splitted[splitted.length - 1].length;
    }
    return 0;
  }

  private collectDecorationTextNode(
    result: QueryResult,
    xpathResults: vscode.DecorationOptions[]
  ) {
    const lineBreaks = this.countLineBreaks(result.foundNode.textContent);
    const startIndexLine = result.foundNode.lineNumber - 1;
    const endIndexColumn =
      result.foundNode.columnNumber + result.foundNode.textContent.length - 1;

    const startPos: Position = new Position(
      startIndexLine,
      result.foundNode.columnNumber - 1
    );

    let endPos: Position;
    if (0 === lineBreaks) {
      endPos = new Position(startIndexLine, endIndexColumn);
    } else {
      endPos = new Position(
        startIndexLine + lineBreaks,
        this.calcEndIndexForTextNode(result)
      );
    }

    xpathResults.push(this.createDecoration(result, startPos, endPos));
  }

  public collectDecorationsV2(
    queryResult: QueryResult[]
  ): vscode.DecorationOptions[] {
    const xpathResults: vscode.DecorationOptions[] = [];

    queryResult.forEach((result) => {
      if (this.isElementNodeType(result.foundNode.nodeType)) {
        this.collectDecorationElementNodeStart(result, xpathResults);
        this.collectDecorationElementNodeEnd(result, xpathResults);
      } else if (this.isTextNodeType(result.foundNode.nodeType)) {
        this.collectDecorationTextNode(result, xpathResults);
      } else if (this.isAttributeNodeType(result.foundNode.nodeType)) {
        this.collectDecorationTextNode(result, xpathResults);
      } else {
        this.xpathOut.appendLine(
          "NodeType " + result.foundNode.nodeType + " currently not supported"
        );
      }
      this.printNodeInformation(result.foundNode);
    });

    return this.removeDuplicateDecorations(xpathResults);
  }

  private printNodeInformation(node: ResultNode) {
    if (this.isTextNodeType(node.nodeType)) {
      this.xpathOut.appendLine(
        "Found node of type " +
          node.nodeType +
          " with value '" +
          node.nodeValue +
          "' at line " +
          node.lineNumber
      );
    } else {
      this.xpathOut.appendLine(
        "Found node of type " +
          node.nodeType +
          " with name '" +
          node.nodeName +
          "' at line " +
          node.lineNumber
      );
    }
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

  private isTextNodeType(nodeType: string): boolean {
    return "Text" === nodeType;
  }

  private isAttributeNodeType(nodeType: string): boolean {
    return "Attribute" === nodeType;
  }
}
