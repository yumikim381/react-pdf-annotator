import React, { CSSProperties } from "react";

import { Rnd } from "react-rnd";
import { getPageFromElement } from "../lib/pdfjs-dom";

import "../style/AreaHighlight.css";
import "../style/Highlight.css";

import type { LTWHP, ViewportHighlight } from "../types";

interface AreaHighlightProps {
  highlight: ViewportHighlight;

  /**
   * A callback function for when the highlight area is either moved or resized.
   * @param rect - The updated highlight area.
   */
  onChange: (rect: LTWHP) => void;

  /** Whether the component is autoscrolled into view. */
  isScrolledTo: boolean;
  style?: CSSProperties;
}

/**
 * A component for displaying and interacting with a rectangular highlight area.
 */
const AreaHighlight = ({
  highlight,
  onChange,
  isScrolledTo,
  style,
}: AreaHighlightProps) => {
  const highlightClass = isScrolledTo ? "AreaHighlight--scrolledTo" : "";

  return (
    <div className={`AreaHighlight ${highlightClass}`}>
      <Rnd
        className="AreaHighlight__part"
        onDragStop={(_, data) => {
          const boundingRect: LTWHP = {
            ...highlight.position.boundingRect,
            top: data.y,
            left: data.x,
          };

          onChange(boundingRect);
        }}
        onResizeStop={(_mouseEvent, _direction, ref, _delta, position) => {
          const boundingRect: LTWHP = {
            top: position.y,
            left: position.x,
            width: ref.offsetWidth,
            height: ref.offsetHeight,
            pageNumber: getPageFromElement(ref)?.number || -1,
          };

          onChange(boundingRect);
        }}
        position={{
          x: highlight.position.boundingRect.left,
          y: highlight.position.boundingRect.top,
        }}
        size={{
          width: highlight.position.boundingRect.width,
          height: highlight.position.boundingRect.height,
        }}
        // Prevevent any event clicks as clicking is already used for movement
        onClick={(event: Event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        style={style}
      />
    </div>
  );
};

export default AreaHighlight;
