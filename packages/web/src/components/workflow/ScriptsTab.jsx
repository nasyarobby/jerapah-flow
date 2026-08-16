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
import { defaultConfigFromMeta } from "../../lib/script.js";
import { newScriptStep, newSetStep } from "../../lib/workflow-doc.js";
import { AddScriptDialog } from "./AddScriptDialog.jsx";
import { ScriptCard } from "./ScriptCard.jsx";

export function ScriptsTab({
  doc,
  onPatch,
  disabled,
  scripts = [],
  workflows = [],
  owner,
  excludeFile,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const steps = doc?.scripts ?? [];
  const ids = steps.map((s) => s.uiId);

  const scriptsByName = new Map();
  for (const s of scripts) {
    const name = typeof s === "string" ? s : s.name;
    scriptsByName.set(name, s);
  }

  function patchSteps(next) {
    onPatch((d) => {
      d.scripts = next;
    });
  }

  function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    patchSteps(arrayMove(steps, oldIndex, newIndex));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-sm opacity-70">
          Steps run top to bottom. In DAG mode, <span className="font-mono">needs</span> selects
          upstream outputs as this step’s data; context is shared per wave.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled}
          onClick={() => setAddOpen(true)}
        >
          <LuPlus className="size-4" />
          Add script
        </button>
      </div>
      {steps.length === 0 ? (
        <p className="text-sm opacity-50">No scripts yet. Add one to get started.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3 pb-6">
              {steps.map((step, index) => (
                <ScriptCard
                  key={step.uiId}
                  step={step}
                  index={index}
                  otherSteps={steps}
                  scriptsByName={scriptsByName}
                  disabled={disabled}
                  workflows={workflows}
                  owner={owner}
                  excludeFile={excludeFile}
                  onChange={(next) => {
                    const copy = [...steps];
                    copy[index] = next;
                    patchSteps(copy);
                  }}
                  onRemove={() => patchSteps(steps.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <AddScriptDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={(picked) => {
          if (picked.kind === "set") {
            patchSteps([...steps, newSetStep()]);
          } else {
            patchSteps([
              ...steps,
              newScriptStep(picked.name, defaultConfigFromMeta(picked.meta)),
            ]);
          }
          setAddOpen(false);
        }}
      />
    </div>
  );
}
