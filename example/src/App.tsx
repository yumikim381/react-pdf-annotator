import React, { MouseEvent, useEffect, useRef, useState } from "react";
import CommentForm from "./CommentForm";
import ContextMenu, { ContextMenuProps } from "./ContextMenu";
import ExpandableTip from "./ExpandableTip";
import HighlightContainer from "./HighlightContainer";
import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";
import {
  GhostHighlight,
  Highlight,
  PdfHighlighter,
  PdfHighlighterUtils,
  PdfLoader,
  Tip,
  ViewportHighlight,
} from "./react-pdf-highlighter-extended";
import "./style/App.css";
import { testHighlights as _testHighlights } from "./test-highlights";
import { CommentedHighlight } from "./types";

const TEST_HIGHLIGHTS = _testHighlights;
const PRIMARY_PDF_URL = "https://arxiv.org/pdf/2203.11115";
const SECONDARY_PDF_URL = "https://arxiv.org/pdf/1604.02480";


const getNextId = () => String(Math.random()).slice(2);
/*
Overall things with hash
- provides a mechanism for navigating to a specific highlighted section on a page based on a URL hash value, which could represent a unique identifier for each highlight
*/
/*
This function extracts an ID from the URL hash.
It assumes that the hash is in the format #highlight-{id}, where {id} is the unique identifier for a highlight.
document.location.hash returns the hash portion of the URL (e.g., #highlight-123)
*/
const parseIdFromHash = () => {
  return document.location.hash.slice("#highlight-".length);
};

const resetHash = () => {
  document.location.hash = "";
};

const App = () => {
  const [url, setUrl] = useState(PRIMARY_PDF_URL);
  const [highlights, setHighlights] = useState<Array<CommentedHighlight>>(
    // here comes array of highlights - Array<CommentedHighlight>
    // 🔴 needs to be defined - at least like empty array 
    TEST_HIGHLIGHTS[PRIMARY_PDF_URL] ?? [],
  );
  const currentPdfIndexRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuProps | null>(null);
  const [pdfScaleValue, setPdfScaleValue] = useState<number | undefined>(
    undefined,
  );
  const [highlightPen, setHighlightPen] = useState<boolean>(false);

  /**
   *  Refs for PdfHighlighter utilities
   * These contain numerous helpful functions, such as scrollToHighlight,
   * getCurrentSelection, setTip, toggleEditInProgress and many more
   * Used as a input to PdfHighlighter component with utilsRef
   */
  const highlighterUtilsRef = useRef<PdfHighlighterUtils>();

  const toggleDocument = () => {
    const urls = [PRIMARY_PDF_URL, SECONDARY_PDF_URL];
    currentPdfIndexRef.current = (currentPdfIndexRef.current + 1) % urls.length;
    setUrl(urls[currentPdfIndexRef.current]);
    setHighlights(TEST_HIGHLIGHTS[urls[currentPdfIndexRef.current]] ?? []);
  };

/**
   * Context menu- can edit or delete a highlight on rightclick
   * Right-click triggers handleContextMenu, 
   * preventing the default context menu and setting contextMenu
   * with the necessary data to display a custom context menu at the right-click location.
   * Left-click anywhere else triggers handleClick (from the useEffect), 
   * which checks if contextMenu is set and then hides it by setting contextMenu to null
   */
useEffect(() => {
  const handleClick = () => {
    /*
    This function checks if contextMenu is currently set
    */
    if (contextMenu) {
      setContextMenu(null);
    }
  };
  /*
  this is set up to listen for any click events (left-clicks) on the document.
   */
  document.addEventListener("click", handleClick);

  return () => {
    /**
     * Removes the event listener when the component unmounts or when the effect is re-run
     */
    document.removeEventListener("click", handleClick);
  };
}, [contextMenu]);

const handleContextMenu = (
  event: MouseEvent<HTMLDivElement>,
  highlight: ViewportHighlight<CommentedHighlight>,
) => {
  /*
  prevents the default right-click context menu from appearing
   */
  event.preventDefault();

  setContextMenu({
    xPos: event.clientX,
    yPos: event.clientY,
    deleteHighlight: () => deleteHighlight(highlight),
    editComment: () => editComment(highlight),
  });
};
  /**
   * all kinds of functions to handle highlights
   */
  const addHighlight = (highlight: GhostHighlight, comment: string) => {
    console.log("Saving highlight", highlight);
    // add highlight to the array of highlights - added in the begining , 
    // highlight is ghostHighlight in the beginningm but get added comment and id 
    //GhostHighlight is like highlight without id get 
    setHighlights([{ ...highlight, comment, id: getNextId() }, ...highlights]);
  };

  const deleteHighlight = (highlight: ViewportHighlight | Highlight) => {
    console.log("Deleting highlight", highlight);
    // delet highlight by filtering it's id 
    setHighlights(highlights.filter((h) => h.id != highlight.id));
  };

  /**
   * Not really the way i want to do things !! 
   * I want to set them to not visible and not just erase them from rendering 
   * Or maybe it's smarter to just erase them 
   * 🔴 think about this 
   */
  const resetHighlights = () => {
    setHighlights([]);
  };

  const getHighlightById = (id: string) => {
    return highlights.find((highlight) => highlight.id === id);
  };

  const editHighlight = (
    idToUpdate: string,
    edit: Partial<CommentedHighlight>,
  ) => {
    console.log(`Editing highlight ${idToUpdate} with `, edit);
    setHighlights(
      highlights.map((highlight) =>
                /**
         * If edit is { content: input } and highlight already has a key-value pair for content, 
         * then the spread operation { ...highlight, ...edit } 
         * will overwrite the content property in highlight with the value from edit
         */
        highlight.id === idToUpdate ? { ...highlight, ...edit } : highlight,
      ),
    );
  };

  // Open comment tip and update highlight with new user input
  const editComment = (highlight: ViewportHighlight<CommentedHighlight>) => {
    if (!highlighterUtilsRef.current) return;
    /** pop up that can be viewed inside PdfHighlighter - has 2 components, 
     * one is positiona nd one is content - which is a reactNode */
    const editCommentTip: Tip = {
      position: highlight.position,
      content: (
        <CommentForm
          placeHolder={highlight.comment}
          onSubmit={(input) => {
            editHighlight(highlight.id, { comment: input });
            highlighterUtilsRef.current!.setTip(null);
            highlighterUtilsRef.current!.toggleEditInProgress(false);
          }}
        ></CommentForm>
      ),
    };
    /**
     * Set a tip to be displayed in the current PDF Viewer.
     * tip to be displayed, or null to hide any tip.
     * If enabled, automatic tips/popups inside of a PdfHighlighter will be disabled. 
     * Additional niceties will also be provided to prevent new highlights being made.
     */
    highlighterUtilsRef.current.setTip(editCommentTip);
    highlighterUtilsRef.current.toggleEditInProgress(true);
  };

    // Scroll to highlight based on hash in the URL
    const scrollToHighlightFromHash = (event) => {
      /**
       * Get the highlight by ID from the URL hash
       */
      console.log("scrollToHighlightFromHash");
      console.log('Old URL:', event.oldURL);
      console.log('New URL:', event.newURL);
      const highlight = getHighlightById(parseIdFromHash());
      /**
       * Scrolling to Highlight: If highlight is found and highlighterUtilsRef.current exists, 
       * it calls highlighterUtilsRef.current.scrollToHighlight(highlight). 
       * This scrollToHighlight method is assumed to scroll to the specific highlight on the page, making it visible.
       */
      if (highlight && highlighterUtilsRef.current) {
        highlighterUtilsRef.current.scrollToHighlight(highlight);
      }
    };
  
    // Hash listeners for autoscrolling to highlights
    useEffect(() => {
      window.addEventListener("hashchange", scrollToHighlightFromHash);
  
      return () => {
        window.removeEventListener("hashchange", scrollToHighlightFromHash);
      };
    }, [scrollToHighlightFromHash]);

  return (
    <div className="App" style={{ display: "flex", height: "100vh" }}>
      <Sidebar
        highlights={highlights}
        resetHighlights={resetHighlights}
        toggleDocument={toggleDocument}
      />
      <div
        style={{
          height: "100vh",
          width: "75vw",
          overflow: "hidden",
          position: "relative",
          flexGrow: 1,
        }}
      >
        <Toolbar setPdfScaleValue={(value) => setPdfScaleValue(value)} toggleHighlightPen={() => setHighlightPen(!highlightPen)} />

        <PdfLoader document={url}>
          {(pdfDocument) => (
            <PdfHighlighter
              enableAreaSelection={(event) => event.altKey}
              pdfDocument={pdfDocument}

              onScrollAway={resetHash}

              utilsRef={(_pdfHighlighterUtils) => {
                highlighterUtilsRef.current = _pdfHighlighterUtils;
              }}
              pdfScaleValue={pdfScaleValue}
              textSelectionColor={highlightPen ? "rgba(255, 226, 143, 1)" : undefined}
              onSelection={highlightPen ? (selection) => addHighlight(selection.makeGhostHighlight(), "") : undefined}
              selectionTip={highlightPen ? undefined : <ExpandableTip addHighlight={addHighlight} />}
              highlights={highlights}
              style={{
                height: "calc(100% - 41px)",
              }}
            >
              <HighlightContainer
                editHighlight={editHighlight}
                onContextMenu={handleContextMenu}
              />
            </PdfHighlighter>
          )}
        </PdfLoader>
      </div>

      {contextMenu && <ContextMenu {...contextMenu} />}
    </div>
  );
};

export default App;
