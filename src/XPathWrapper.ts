import { Query, QueryResult } from "./types";

export class XPathWrapper {
  private xpath = require("xpath");
  private dom = require("xmldom").DOMParser;

  public checkXPath(query: Query, xml: string): QueryResult[] {
    if (!query.expression) {
      return [];
    }
    const doc = new this.dom().parseFromString(xml);

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
        foundNode: node.toString(),
      })
    );
    return resultArray;
  }

  private evaluateXPath(query: Query, doc: any): QueryResult[] {
    let contextNodes = this.selectXPath(query.contextNode, doc);
    let resultArray: QueryResult[] = [];

    contextNodes.forEach((contextNode) => {
      console.log("Context-Node: " + contextNode.toString());

      var results = this.xpath.evaluate(
        "." + query.expression, // xpathExpression
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
            contextNode: contextNode.toString(),
            foundNode: result.toString(),
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
