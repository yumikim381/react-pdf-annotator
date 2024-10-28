import { Highlight, Content } from "./react-pdf-highlighter-extended";

export interface CommentedHighlight extends Highlight {
  content: Content;
  comment?: string;
}


export interface AnnHighlight extends Omit<Highlight, "content"> {
  content: string;
  type: "area";
}