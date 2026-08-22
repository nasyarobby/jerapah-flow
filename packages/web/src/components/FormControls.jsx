/**
 * Shared DaisyUI form controls — always bordered + sm.
 */

import { forwardRef } from "react";

export const FormInput = forwardRef(function FormInput({ className = "", ...props }, ref) {
  return <input ref={ref} className={`input input-bordered input-sm ${className}`.trim()} {...props} />;
});

export const FormSelect = forwardRef(function FormSelect({ className = "", children, ...props }, ref) {
  return (
    <select ref={ref} className={`select select-bordered select-sm ${className}`.trim()} {...props}>
      {children}
    </select>
  );
});

export const FormTextarea = forwardRef(function FormTextarea({ className = "", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={`textarea textarea-bordered textarea-sm ${className}`.trim()}
      {...props}
    />
  );
});
