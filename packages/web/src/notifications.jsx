import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LuX } from "react-icons/lu";

const NotificationContext = createContext(null);

const TYPES = new Set(["info", "success", "warning", "error"]);
const ALERT_CLASS = {
  info: "alert-info",
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
};

const DEFAULT_DURATION = 4000;
const MAX_ITEMS = 5;

let seq = 0;
function nextId() {
  seq += 1;
  return `toast-${seq}`;
}

function isSticky(duration) {
  return duration === 0 || duration === Infinity;
}

function parseNotify(input) {
  const raw = typeof input === "string" ? { message: input } : (input ?? {});
  const type = TYPES.has(raw.type) ? raw.type : "info";
  const message = String(raw.message ?? "");
  const duration = raw.duration ?? DEFAULT_DURATION;
  return { type, message, duration };
}

export function NotificationProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer != null) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const notify = useMemo(() => {
    function notifyFn(input) {
      const parsed = parseNotify(input);
      if (!parsed.message) return null;

      const id = nextId();
      const item = { id, ...parsed };

      setItems((prev) => {
        let kept = prev;
        if (prev.length >= MAX_ITEMS) {
          const overflow = prev.slice(0, prev.length - MAX_ITEMS + 1);
          for (const old of overflow) {
            const timer = timers.current.get(old.id);
            if (timer != null) {
              clearTimeout(timer);
              timers.current.delete(old.id);
            }
          }
          kept = prev.slice(prev.length - MAX_ITEMS + 1);
        }
        return [...kept, item];
      });

      if (!isSticky(parsed.duration)) {
        timers.current.set(
          id,
          setTimeout(() => dismissRef.current(id), parsed.duration),
        );
      }
      return id;
    }

    notifyFn.success = (message, opts) => notifyFn({ type: "success", message, ...opts });
    notifyFn.error = (message, opts) => notifyFn({ type: "error", message, ...opts });
    notifyFn.warning = (message, opts) => notifyFn({ type: "warning", message, ...opts });
    notifyFn.info = (message, opts) => notifyFn({ type: "info", message, ...opts });
    return notifyFn;
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ items, notify, dismiss }), [items, notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastHost items={items} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

function ToastHost({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="toast toast-end toast-bottom z-[100]">
      {items.map((item) => (
        <div
          key={item.id}
          role={item.type === "warning" || item.type === "error" ? "alert" : "status"}
          className={`alert ${ALERT_CLASS[item.type] ?? "alert-info"}`}
        >
          <span>{item.message}</span>
          <button
            type="button"
            className="btn btn-sm btn-circle btn-ghost"
            aria-label="Dismiss"
            onClick={() => onDismiss(item.id)}
          >
            <LuX className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
