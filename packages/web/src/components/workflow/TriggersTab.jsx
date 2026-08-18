import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LuPlus } from "react-icons/lu";
import { newCronTrigger, newHttpTrigger, newWorkflowTrigger } from "../../lib/workflow-doc.js";
import { AddTriggerDialog, TriggerCard } from "./TriggerCard.jsx";

export function TriggersTab({
  doc,
  onPatch,
  disabled,
  owner,
  auths = [],
  pages = [],
  workflows = [],
  excludeFile,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const triggers = doc?.triggers ?? [];
  const ids = triggers.map((t) => t.uiId);

  function patchTriggers(next) {
    onPatch((d) => {
      d.triggers = next;
    });
  }

  function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    patchTriggers(arrayMove(triggers, oldIndex, newIndex));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-sm opacity-70">How this workflow is started. Manual Run from the Test panel is always available.</p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled}
          onClick={() => setAddOpen(true)}
        >
          <LuPlus className="size-4" />
          Add trigger
        </button>
      </div>
      {triggers.length === 0 ? (
        <p className="text-sm opacity-50">No triggers. The Test panel can still run a saved workflow.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3 pb-6">
              {triggers.map((trigger, index) => (
                <TriggerCard
                  key={trigger.uiId}
                  trigger={trigger}
                  index={index}
                  owner={owner}
                  auths={auths}
                  pages={pages}
                  workflows={workflows}
                  excludeFile={excludeFile}
                  disabled={disabled}
                  onChange={(next) => {
                    const copy = [...triggers];
                    copy[index] = next;
                    patchTriggers(copy);
                  }}
                  onRemove={() => patchTriggers(triggers.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <AddTriggerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={(kind) => {
          const next =
            kind === "cron"
              ? newCronTrigger()
              : kind === "workflow"
                ? newWorkflowTrigger()
                : newHttpTrigger();
          patchTriggers([...triggers, next]);
          setAddOpen(false);
        }}
      />
    </div>
  );
}
