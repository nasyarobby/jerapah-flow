import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const EMPTY_DEPS = Object.freeze([]);

/**
 * Open/close an editor modal driven by list / new / edit routes.
 *
 * Pages supply route flags, list path, and builders for the editor payload.
 * The hook owns `editor` state, the opened-route guard ref, and navigation
 * back to the list when closing from a deep-linked route.
 *
 * @param {object} options
 * @param {boolean} options.isNewRoute
 * @param {boolean} options.isEditRoute
 * @param {string | (() => string)} options.listPath
 * @param {() => string} [options.newRouteKey] defaults to `"new"`
 * @param {() => boolean} [options.canOpenNew] return false to wait (e.g. owners loading)
 * @param {() => void} [options.onBeforeOpenNew] side effects before opening (e.g. sync filter)
 * @param {() => object} options.buildNewEditor
 * @param {() => string} options.editRouteKey
 * @param {() => boolean} [options.canOpenEdit] return false to wait / prepare (e.g. sync owner)
 * @param {() => void} [options.onOpenEdit] after key is claimed (e.g. highlight row)
 * @param {() => object} options.buildEditEditor
 * @param {unknown[]} [options.newDeps] extra deps for the new-route effect
 * @param {unknown[]} [options.editDeps] extra deps for the edit-route effect
 */
export function useRouteDrivenModal({
  isNewRoute,
  isEditRoute,
  listPath,
  newRouteKey = () => "new",
  canOpenNew,
  onBeforeOpenNew,
  buildNewEditor,
  editRouteKey,
  canOpenEdit,
  onOpenEdit,
  buildEditEditor,
  newDeps = EMPTY_DEPS,
  editDeps = EMPTY_DEPS,
}) {
  const navigate = useNavigate();
  const [editor, setEditor] = useState(null);
  const openedRouteKey = useRef(null);

  function resolveListPath() {
    return typeof listPath === "function" ? listPath() : listPath;
  }

  function closeEditor() {
    setEditor(null);
    openedRouteKey.current = null;
    if (isNewRoute || isEditRoute) {
      navigate(resolveListPath(), { replace: true });
    }
  }

  useEffect(() => {
    if (!isNewRoute) return;
    const key = newRouteKey();
    if (openedRouteKey.current === key) return;
    if (canOpenNew && !canOpenNew()) return;
    onBeforeOpenNew?.();
    openedRouteKey.current = key;
    setEditor(buildNewEditor());
    // Callers pass explicit newDeps; builders close over latest render values.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [isNewRoute, ...newDeps]);

  useEffect(() => {
    if (!isEditRoute) {
      if (!isNewRoute) openedRouteKey.current = null;
      return;
    }
    if (canOpenEdit && !canOpenEdit()) return;
    const key = editRouteKey();
    if (openedRouteKey.current === key) return;
    openedRouteKey.current = key;
    onOpenEdit?.();
    setEditor(buildEditEditor());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [isEditRoute, isNewRoute, ...editDeps]);

  return { editor, setEditor, closeEditor, openedRouteKey };
}
