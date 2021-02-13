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
      throw new Error("Given document could not be parsed as XML");
    }

    if (query.contextNode) {
      return this.evaluateXPath(query, doc);
    } else {
      return this.nodesToResultArray(this.selectXPath(query.expression, doc));
    }
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

  private getExpressionForEvaluate(query: Query): String {
    if (query.expression.startsWith(".")) {
      return query.expression;
    } else {
      return "." + query.expression;
    }
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
    let resultNode = {
      nodeType: this.mapNodeType(node.nodeType),
      columnNumber: node.columnNumber,
      lineNumber: node.lineNumber,
      textContent: node.toString(),
    } as ResultNode;

    if (node.parentNode) {
      resultNode.parentNode = this.createResultNode(node.parentNode);
    }
    return resultNode;
  }

  private evaluateXPath(query: Query, doc: any): QueryResult[] {
    let contextNodes = this.selectXPath(query.contextNode, doc);
    let resultArray: QueryResult[] = [];
    let expression = this.getExpressionForEvaluate(query);

    contextNodes.forEach((contextNode) => {
      console.log("Context-Node: " + contextNode.toString());
      const contextNodeAsResultNode = this.createResultNode(contextNode);
      var results = this.xpath.evaluate(
        expression, // xpathExpression
        contextNode, // contextNode
        null, // namespaceResolver
        this.xpath.XPathResult.ANY_TYPE, // resultType
        null // result
      );

      console.log("Results: " + results.toString());
      if (!results) {
        throw new Error(
          "Expression '" +
            query.expression +
            "'not found in for context node '" +
            query.contextNode +
            "'"
        );
      } else {
        let result = results.iterateNext();

        while (result) {
          resultArray.push({
            contextNode: contextNodeAsResultNode,
            foundNode: this.createResultNode(result),
          });
          result = results.iterateNext();
        }
      }
    });

    return resultArray;
  }

  private selectXPath(expression: string, doc: any): any[] {
    const nodes = this.xpath.select(expression, doc);

    if (!nodes || nodes.length === 0) {
      throw new Error(
        "Expression '" + expression + "'not found in given XML document"
      );
    } else {
      console.log("Number of Nodes found: " + nodes.length);
      return nodes;
    }
  }
}
