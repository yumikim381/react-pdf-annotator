import React from "react";
import type { ViewportHighlight } from "./react-pdf-highlighter-extended";

import "./style/HighlightPopup.css";
import { CommentedHighlight } from "./types";

interface HighlightPopupProps {
  highlight: ViewportHighlight<CommentedHighlight>;
}

const HighlightPopup = ({ highlight }: HighlightPopupProps) => {
  return highlight.content.text? (
    <div className="Highlight__popup">{highlight.content.text}</div>
  ) : (
    <div className="Highlight__popup">Comment has no Text</div>
  );
};

export default HighlightPopup;
