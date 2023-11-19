import "pdfjs-dist/web/pdf_viewer.css";
import "../style/pdf_viewer.css";
import "../style/PdfHighlighter.css";

import {
  EventBus,
  NullL10n,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/legacy/web/pdf_viewer";
import type {
  Content,
  IHighlight,
  LTWH,
  LTWHP,
  Position,
  Scaled,
  ScaledPosition,
} from "../types";
import React, { PointerEventHandler, useEffect, useRef, useState } from "react";
import {
  asElement,
  findOrCreateContainerLayer,
  getPageFromElement,
  getPagesFromRange,
  getWindow,
  isHTMLElement,
} from "../lib/pdfjs-dom";
import {
  scaledToViewport,
  viewportPositionToScaled,
  viewportToScaled,
} from "../lib/coordinates";
import MouseSelection from "./MouseSelection";
import type { PDFDocumentProxy } from "pdfjs-dist";
import TipContainer from "./TipContainer";
import { createRoot, Root } from "react-dom/client";
import debounce from "lodash.debounce";
import getBoundingRect from "../lib/get-bounding-rect";
import getClientRects from "../lib/get-client-rects";
import { HighlightLayer } from "./HighlightLayer";
import groupHighlightsByPage from "../lib/group-highlights-by-page";
import TipRenderer from "./TipRenderer";
import screenshot from "../lib/screenshot";
import MouseSelectionRender from "./MouseSelectionRenderer";

export type T_ViewportHighlight<T_HT> = { position: Position } & T_HT;

interface Props<T_HT> {
  highlightTransform: (
    highlight: T_ViewportHighlight<T_HT>,
    index: number,
    setTip: (
      highlight: T_ViewportHighlight<T_HT>,
      callback: (highlight: T_ViewportHighlight<T_HT>) => JSX.Element
    ) => void,
    hideTip: () => void,
    viewportToScaled: (rect: LTWHP) => Scaled,
    screenshot: (position: LTWH) => string,
    isScrolledTo: boolean
  ) => JSX.Element;
  highlights: Array<T_HT>;
  onScrollChange: () => void;
  scrollRef: (scrollTo: (highlight: T_HT) => void) => void;
  pdfDocument: PDFDocumentProxy;
  pdfScaleValue?: string;
  onSelectionFinished: (
    position: ScaledPosition,
    content: { text?: string; image?: string },
    hideTipAndSelection: () => void,
    transformSelection: () => void
  ) => JSX.Element | null;
  enableAreaSelection?: (event: MouseEvent) => boolean;
}

interface HighlightRoot {
  reactRoot: Root;
  container: Element;
}

interface GhostHighlight {
  position: ScaledPosition;
  content?: Content;
}

interface Tip<T_HT> {
  highlight: T_ViewportHighlight<T_HT>;
  callback: (highlight: T_ViewportHighlight<T_HT>) => React.JSX.Element;
}

const EMPTY_ID = "empty-id";

const PdfHighlighter = <T_HT extends IHighlight>({
  highlightTransform,
  highlights,
  onScrollChange,
  scrollRef,
  pdfDocument,
  pdfScaleValue = "auto",
  onSelectionFinished,
  enableAreaSelection,
}: Props<T_HT>) => {
  const highlightsRef = useRef(highlights);
  const ghostHighlight = useRef<GhostHighlight | null>(null);
  const isCollapsed = useRef(true);
  const range = useRef<Range | null>(null);
  const scrolledToHighlightId = useRef(EMPTY_ID);
  const areaSelectionInProgress = useRef(false);
  const [tip, setTip] = useState<Tip<T_HT> | null>(null);
  const [tipPosition, setTipPosition] = useState<Position | null>(null);
  const [tipChildren, setTipChildren] = useState<React.JSX.Element | null>(
    null
  );

  const containerNodeRef = useRef<HTMLDivElement | null>(null);
  const highlightRoots = useRef<{ [page: number]: HighlightRoot }>({});
  const eventBus = useRef<EventBus>(new EventBus());
  const linkService = useRef<PDFLinkService>(
    new PDFLinkService({
      eventBus: eventBus.current,
      externalLinkTarget: 2,
    })
  );
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const viewer = useRef<PDFViewer | null>(null);
  const [isViewerReady, setViewerReady] = useState(false);

  useEffect(() => {
    resizeObserver.current = new ResizeObserver(debouncedScaleValue);
    const doc = containerNodeRef.current?.ownerDocument;
    if (!doc || !containerNodeRef.current) return;

    eventBus.current.on("textlayerrendered", renderHighlightLayers);
    eventBus.current.on("pagesinit", onDocumentReady);
    doc.addEventListener("selectionchange", onSelectionChange);
    doc.addEventListener("keydown", handleKeyDown);
    doc.defaultView?.addEventListener("resize", debouncedScaleValue);
    resizeObserver.current.observe(containerNodeRef.current);

    viewer.current =
      viewer.current ||
      new PDFViewer({
        container: containerNodeRef.current!,
        eventBus: eventBus.current,
        textLayerMode: 2,
        removePageBorders: true,
        linkService: linkService.current,
        l10n: NullL10n,
      });

    linkService.current.setDocument(pdfDocument);
    linkService.current.setViewer(viewer);
    viewer.current.setDocument(pdfDocument);

    setViewerReady(true);

    return () => {
      eventBus.current.off("pagesinit", onDocumentReady);
      eventBus.current.off("textlayerrendered", renderHighlightLayers);
      doc.removeEventListener("selectionchange", onSelectionChange);
      doc.removeEventListener("keydown", handleKeyDown);
      doc.defaultView?.removeEventListener("resize", debouncedScaleValue);
      resizeObserver.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    highlightsRef.current = highlights;
    renderHighlightLayers();
  }, [highlights]);

  const findOrCreateHighlightLayer = (page: number) => {
    const { textLayer } = viewer.current!.getPageView(page - 1) || {};
    if (!textLayer) return null;

    return findOrCreateContainerLayer(
      textLayer.div,
      "PdfHighlighter__highlight-layer"
    );
  };

  const showTip = (
    highlight: T_ViewportHighlight<T_HT>,
    content: React.JSX.Element
  ) => {
    // Check if highlight is in progress
    if (
      !isCollapsed.current ||
      ghostHighlight.current ||
      areaSelectionInProgress.current
    )
      return;
    setTipPosition(highlight.position);
    setTipChildren(content);
  };

  const hideTipAndSelection = () => {
    setTipPosition(null);
    setTipChildren(null);
    ghostHighlight.current = null;
    setTip(null);
    renderHighlightLayers();
  };

  const scrollTo = (highlight: T_HT) => {
    const { boundingRect, usePdfCoordinates } = highlight.position;
    const pageNumber = boundingRect.pageNumber;

    viewer.current!.container.removeEventListener("scroll", onScroll);

    const pageViewport = viewer.current!.getPageView(pageNumber - 1).viewport;

    const scrollMargin = 10;

    viewer.current!.scrollPageIntoView({
      pageNumber,
      destArray: [
        null, // null since we pass pageNumber already as an arg
        { name: "XYZ" },
        ...pageViewport.convertToPdfPoint(
          0, // Default x coord
          scaledToViewport(boundingRect, pageViewport, usePdfCoordinates).top -
            scrollMargin
        ),
        0, // Default z coord
      ],
    });

    scrolledToHighlightId.current = highlight.id;
    renderHighlightLayers();

    // wait for scrolling to finish
    setTimeout(() => {
      viewer.current!.container.addEventListener("scroll", onScroll);
    }, 100);
  };

  const onDocumentReady = () => {
    handleScaleValue();
    scrollRef(scrollTo);
  };

  const onSelectionChange = () => {
    const container = containerNodeRef.current;
    const selection = getWindow(container).getSelection();

    if (!selection) return;

    const newRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    if (selection.isCollapsed) {
      isCollapsed.current = true;
      return;
    }

    if (
      !newRange ||
      !container ||
      !container.contains(newRange.commonAncestorContainer) // Sanity check the selected text is in the container
    ) {
      return;
    }

    isCollapsed.current = false;
    range.current = newRange;
    debouncedAfterSelection();
  };

  const onScroll = () => {
    onScrollChange();
    scrolledToHighlightId.current = EMPTY_ID;
    renderHighlightLayers();
  };

  const onMouseDown: PointerEventHandler = (event) => {
    if (
      !isHTMLElement(event.target) ||
      asElement(event.target).closest(".PdfHighlighter__tip-container") // Ignore selections on tip container
    ) {
      return;
    }

    hideTipAndSelection();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Escape") hideTipAndSelection();
  };

  const afterSelection = () => {
    if (!range.current || isCollapsed.current) {
      return;
    }

    const pages = getPagesFromRange(range.current);
    if (!pages || pages.length === 0) {
      return;
    }

    const rects = getClientRects(range.current, pages);
    if (rects.length === 0) {
      return;
    }

    const boundingRect = getBoundingRect(rects);
    const viewportPosition: Position = {
      boundingRect,
      rects,
    };

    const content = { text: range.current.toString() };
    const scaledPosition = viewportPositionToScaled(
      viewportPosition,
      viewer.current!
    );

    setTipPosition(viewportPosition);
    setTipChildren(
      onSelectionFinished(scaledPosition, content, hideTipAndSelection, () => {
        ghostHighlight.current = {
          ...ghostHighlight.current,
          position: scaledPosition,
        };
        renderHighlightLayers();
      })
    );
  };

  const debouncedAfterSelection = debounce(afterSelection, 500);

  const handleScaleValue = () => {
    if (viewer) {
      viewer.current!.currentScaleValue = pdfScaleValue; //"page-width";
    }
  };

  const debouncedScaleValue = debounce(handleScaleValue, 500);

  const renderHighlightLayers = () => {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      const highlightRoot = highlightRoots.current[pageNumber];

      // Need to check if container is still attached to the DOM as PDF.js can unload pages.
      if (highlightRoot?.container?.isConnected) {
        renderHighlightLayer(highlightRoot.reactRoot, pageNumber);
      } else {
        const highlightLayer = findOrCreateHighlightLayer(pageNumber);

        if (highlightLayer) {
          const reactRoot = createRoot(highlightLayer);
          highlightRoots.current[pageNumber] = {
            reactRoot,
            container: highlightLayer,
          };
          renderHighlightLayer(reactRoot, pageNumber);
        }
      }
    }
  };

  const renderHighlightLayer = (root: Root, pageNumber: number) => {
    root.render(
      <HighlightLayer
        // @ts-ignore
        highlightsByPage={groupHighlightsByPage([
          // @ts-ignore
          ...highlightsRef.current,
          // @ts-ignore
          ghostHighlight.current,
        ])}
        pageNumber={pageNumber.toString()}
        scrolledToHighlightId={scrolledToHighlightId.current}
        highlightTransform={highlightTransform}
        tip={tip}
        hideTipAndSelection={hideTipAndSelection}
        viewer={viewer.current}
        screenshot={screenshot}
        showTip={showTip}
        setState={setTip}
      />
    );
  };

  return (
    <div onPointerDown={onMouseDown}>
      <div ref={containerNodeRef} className="PdfHighlighter">
        <div className="pdfViewer" />
        {isViewerReady && (
          <TipRenderer
            tipPosition={tipPosition}
            tipChildren={tipChildren}
            viewer={viewer.current!}
          />
        )}
        {isViewerReady && (
          <MouseSelectionRender
            viewer={viewer.current!}
            onChange={(isVisible) =>
              (areaSelectionInProgress.current = isVisible)
            }
            enableAreaSelection={enableAreaSelection}
            afterSelection={(
              viewportPosition,
              scaledPosition,
              image,
              resetSelection
            ) => {
              setTipPosition(viewportPosition);
              setTipChildren(
                onSelectionFinished(
                  scaledPosition,
                  { image },
                  hideTipAndSelection,
                  () => {
                    ghostHighlight.current = {
                      position: scaledPosition,
                      content: { image },
                    };
                    resetSelection();
                    renderHighlightLayers();
                  }
                )
              );
            }}
          />
        )}
      </div>
    </div>
  );
};

export default PdfHighlighter;
