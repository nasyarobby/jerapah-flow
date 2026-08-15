import { brandWorkflowFile } from "../theme/brand.js";

export function WorkflowFileIcon({ className = "size-8" }) {
  return (
    <img
      src={brandWorkflowFile}
      alt=""
      className={`${className} object-contain`}
      aria-hidden
    />
  );
}
