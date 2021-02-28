import { Query, QueryResult, ResultNode } from "./types";

export class XPathWrapper {
  private xpath = require("xpath");
  private dom = require("xmldom").DOMParser;

  public checkXPath(query: Query, xml: string): QueryResult[] {
    if (!query.expression) {
      return [];
    }
    let doc: any;

    try {
      doc = new this.dom().parseFromString(xml);
    } catch (e) {
      console.error(e);
      throw new Error("Given document could not be parsed as XML");
    }

    if (query.contextNode) {
      return this.evaluateXPath(query, doc);
    } else {
      const selectedXpath = this.selectXPath(query.expression, doc);
      if (Array.isArray(selectedXpath)) {
        return this.nodesToResultArray(selectedXpath);
      } else {
        let resultArray: QueryResult[] = [];
        resultArray.push({
          foundNode: {} as ResultNode,
          numericResult: selectedXpath,
        });
        return resultArray;
      }
    }
  }

  public getDomAsString(xml: string): string {
    let doc: any;
    try {
      doc = new this.dom().parseFromString(xml);
    } catch (e) {
      console.error(e);
      throw new Error("Given document could not be parsed as XML");
    }
    return doc.toString();
  }

  private nodesToResultArray(nodeArray: any[]): QueryResult[] {
    let resultArray: QueryResult[] = [];
    nodeArray.forEach((node) =>
      resultArray.push({
        foundNode: this.createResultNode(node),
      })
    );
    return resultArray;
  }

  private getExpressionForEvaluate(query: Query): string {
    if (query.expression.startsWith(".")) {
      return query.expression;
    } else if (query.expression.startsWith("/")) {
      return "." + query.expression;
    } else if (query.expression.indexOf("(/") > -1) {
      //add point between ( and /
      const splitAt = query.expression.indexOf("(/") + 1;
      return (
        query.expression.substring(0, splitAt) +
        "." +
        query.expression.substring(splitAt)
      );
    }
    return query.expression;
  }

  private mapNodeType(nodeType: number): String {
    switch (nodeType) {
      case 1:
        return "Element";
      case 2:
        return "Attribute";
      case 3:
        return "Text";
      case 4:
        return "CDATASection";
      case 5:
        return "EntityReference";
      case 6:
        return "Entity";
      case 7:
        return "ProcessingInstruction";
      case 8:
        return "Comment";
      case 9:
        return "Document";
      case 10:
        return "DocumentType";
      case 11:
        return "DocumentFragment";
      case 12:
        return "Notation";
      default:
        return "Unknown";
    }
  }

  private createResultNode(node: any): ResultNode {
    return this.createResultNodeWithParentAndChildren(node, true, true);
  }

  private createResultNodeWithParentAndChildren(
    node: any,
    addParent: boolean,
    addChildren: boolean
  ): ResultNode {
    let resultNode = {
      nodeType: this.mapNodeType(node.nodeType),
      nodeName: node.nodeName,
      columnNumber: node.columnNumber,
      lineNumber: node.lineNumber,
      textContent: node.toString(),
    } as ResultNode;

    if (node.length) {
      resultNode.length = node.length;
    }
    if (node.localName) {
      resultNode.localName = node.localName;
    }
    if (node.nodeValue) {
      resultNode.nodeValue = node.nodeValue;
    }
    if (node.tagName) {
      resultNode.tagName = node.tagName;
    }
    if (addParent && node.parentNode) {
      resultNode.parentNode = this.createResultNodeWithParentAndChildren(
        node.parentNode,
        false,
        false
      );
    }

    if (addChildren && node.childNodes) {
      resultNode.childNodes = [];
      for (let i = 0; i < node.childNodes.length; i++) {
        resultNode.childNodes?.push(
          this.createResultNodeWithParentAndChildren(
            node.childNodes[i],
            false,
            false
          )
        );
      }
    }

    return resultNode;
  }

  private evaluateXPath(query: Query, doc: any): QueryResult[] {
    let contextNodes = this.selectXPath(query.contextNode, doc);
    let resultArray: QueryResult[] = [];
    let expression = this.getExpressionForEvaluate(query);

    contextNodes.forEach((contextNode) => {
      const contextNodeAsResultNode = this.createResultNode(contextNode);
      let results: any;
      try {
        results = this.xpath.evaluate(
          expression, // xpathExpression
          contextNode, // contextNode
          null, // namespaceResolver
          this.xpath.XPathResult.ANY_TYPE, // resultType
          null // result
        );
      } catch (e) {
        console.error(e);
        throw new Error(
          "Expression '" + expression + "'is not a valid XPath Query"
        );
      }

      if (!results) {
        throw new Error(
          "Expression '" +
            query.expression +
            "'not found in for context node '" +
            query.contextNode +
            "'"
        );
      } else if (1 === results.resultType) {
        resultArray.push({
          foundNode: {} as ResultNode,
          numericResult: results.numberValue,
        });
      } else {
        let result = results.iterateNext();
        let index = 0;
        while (result) {
          let foundNode = this.createResultNode(result);
          foundNode.indexInContext = index;
          resultArray.push({
            contextNode: contextNodeAsResultNode,
            foundNode: foundNode,
          });
          result = results.iterateNext();
          index++;
        }
        contextNodeAsResultNode.numberOfNodesInContext = index;
      }
    });

    return resultArray;
  }

  private selectXPath(expression: string, doc: any): any[] {
    let nodes: any[];
    try {
      nodes = this.xpath.select(expression, doc);
    } catch (e) {
      console.error(e);
      throw new Error(
        "Expression '" + expression + "'is not a valid XPath Query"
      );
    }

    if (!nodes || nodes.length === 0) {
      console.log(doc);
      throw new Error(
        "Expression '" + expression + "'not found in given XML document"
      );
    } else {
      console.log("Number of Nodes found: " + nodes.length);
      return nodes;
    }
  }
}
