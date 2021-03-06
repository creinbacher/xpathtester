import { LanguageConfiguration } from "vscode";

export type Query = {
  expression: string;
  contextNode: string;
};

export type QueryResult = {
  foundNode: ResultNode;
  contextNode?: ResultNode;
  numericResult?: number;
};

export type ResultNode = {
  nodeType: string;
  columnNumber: number;
  lineNumber: number;
  length?: number;
  indexInContext?: number;
  numberOfNodesInContext?: number;
  parentNode?: ResultNode;
  textContent: string;
  localName?: string;
  nodeName: string;
  nodeValue?: string;
  tagName?: string;
  childNodes?: ResultNode[];
};
