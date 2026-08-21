import { Modal } from "./Modal.jsx";

/**
 * Shared confirm / delete dialog.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {import("react").ReactNode} [props.message]
 * @param {string} [props.confirmLabel]
 * @param {string} [props.confirmClass]
 * @param {boolean} [props.loading]
 * @param {boolean} [props.pending] alias for loading
 * @param {boolean} [props.confirmDisabled]
 * @param {import("react").ReactNode} [props.error]
 * @param {() => void} props.onCancel
 * @param {() => void} props.onConfirm
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  confirmClass = "btn-error",
  loading,
  pending,
  confirmDisabled = false,
  error,
  onCancel,
  onConfirm,
}) {
  const busy = Boolean(loading ?? pending);

  return (
    <Modal open={open} onClose={onCancel} boxClassName="max-w-md" aria-label={title}>
      <h3 className="font-bold">{title}</h3>
      {message ? <div className="mt-2 text-sm opacity-70">{message}</div> : null}
      {error ? <p className="text-error text-sm mt-2">{error}</p> : null}
      <div className="modal-action">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${confirmClass}`}
          disabled={busy || confirmDisabled}
          onClick={onConfirm}
        >
          {busy ? <span className="loading loading-spinner loading-xs" /> : null}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
