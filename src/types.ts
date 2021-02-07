export type Query = {
  expression: string;
  contextNode: string;
};

export type QueryResult = {
  foundNode: string;
  contextNode?: string;
};
