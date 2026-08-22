import { useEffect, useId, useRef } from "react";

/**
 * DaisyUI modal shell with Escape, labeled backdrop close, and a light focus trap.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {import("react").ReactNode} props.children
 * @param {string} [props.boxClassName]
 * @param {string} [props["aria-labelledby"]]
 * @param {string} [props["aria-label"]]
 */
export function Modal({
  open,
  onClose,
  children,
  boxClassName = "",
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
}) {
  const boxRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const fallbackId = useId();
  const labelledBy = ariaLabelledBy || (ariaLabel ? undefined : fallbackId);

  useEffect(() => {
    if (!open) return undefined;

    const box = boxRef.current;
    const previous = /** @type {HTMLElement | null} */ (document.activeElement);

    function focusables() {
      if (!box) return [];
      return [
        ...box.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el instanceof HTMLElement && !el.hasAttribute("disabled"));
    }

    const first = focusables()[0];
    first?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <dialog className="modal modal-open" aria-modal="true" aria-labelledby={labelledBy} aria-label={ariaLabel}>
      <div ref={boxRef} className={`modal-box ${boxClassName}`.trim()} id={ariaLabelledBy ? undefined : fallbackId}>
        {children}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" aria-label="Close dialog" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
