import React, { MouseEvent } from "react";
import HighlightPopup from "./HighlightPopup";
import {
  AreaHighlight,
  Highlight,
  MonitoredHighlightContainer,
  TextHighlight,
  Tip,
  ViewportHighlight,
  useTipViewerUtils,
  useHighlightUtils,
} from "./react-pdf-highlighter";

interface HighlightRendererProps {
  updateHighlight: (
    highlightId: string,
    position: Object,
    content: Object
  ) => void;
  onContextMenu?: (
    event: MouseEvent<HTMLDivElement>,
    highlight: ViewportHighlight
  ) => void;
}

const HighlightRenderer = ({
  updateHighlight,
  onContextMenu,
}: HighlightRendererProps) => {
  const {
    highlight,
    key,
    isSelectionInProgress,
    viewportToScaled,
    screenshot,
    isScrolledTo,
    highlightBindings,
  } = useHighlightUtils();

  const { setTip, isEditInProgressRef } = useTipViewerUtils();

  const isTextHighlight = !Boolean(
    highlight.content && highlight.content.image
  );

  const component = isTextHighlight ? (
    <TextHighlight
      isScrolledTo={isScrolledTo}
      position={highlight.position}
      onContextMenu={(event) =>
        onContextMenu && onContextMenu(event, highlight)
      }
    />
  ) : (
    <AreaHighlight
      isScrolledTo={isScrolledTo}
      highlight={highlight}
      onChange={(boundingRect) => {
        updateHighlight(
          highlight.id,
          { boundingRect: viewportToScaled(boundingRect) },
          { image: screenshot(boundingRect) }
        );

        isEditInProgressRef.current = false;
      }}
      bounds={highlightBindings.textLayer}
      onContextMenu={(event) =>
        onContextMenu && onContextMenu(event, highlight)
      }
      onEditStart={() => (isEditInProgressRef.current = true)}
    />
  );

  return (
    <MonitoredHighlightContainer
      popupContent={<HighlightPopup comment={highlight.comment} />}
      onMouseOver={(popupContent) => {
        if (isSelectionInProgress()) return;

        const popupTip: Tip = {
          position: highlight.position,
          content: popupContent,
        };
        setTip(popupTip);
      }}
      onMouseOut={() => {
        setTip(null);
      }}
      key={key}
      children={component}
    />
  );
};

export default HighlightRenderer;