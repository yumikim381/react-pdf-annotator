import React, { useState } from "react";

interface CommentFormProps {
  onSubmit: (input: string) => void;
  placeHolder?: string;
}

const CommentForm = ({ onSubmit, placeHolder }: CommentFormProps) => {
  const [input, setInput] = useState<string>(placeHolder || "");

  return (
    <form
      className="Tip__card"
      /**
       * Prevents the browser’s default form submission behavior, which would cause a page reload.
       *  Instead, use the custom onSubmit function to handle the form submission from parents 
       */
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(input);
      }}
    >
      <div>
        <textarea
          value={input} // Set the current input value
          /**
           *  Automatically focuses the textarea when the component renders, so the user can start typing immediately
           * "focus" refers to the state where an input element is ready to receive user input.
           */
          autoFocus
          onChange={(event) => {
            setInput(event.target.value);
          }}
        />
      </div>
      <div>
        <input type="submit" value="Save" />
      </div>
    </form>
  );
};

export default CommentForm;
