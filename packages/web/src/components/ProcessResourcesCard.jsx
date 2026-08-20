import { formatBytes, formatCpu } from "../lib/format.js";

export function ProcessResourcesCard({ children }) {
  const totals = children?.totals ?? { memory: 0, cpu: 0 };

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4">
        <h2 className="card-title text-lg">Resources</h2>
        <div className="space-y-1 text-sm tabular-nums">
          <p>{formatBytes(totals.memory)} memory total</p>
          <p>{formatCpu(totals.cpu)} CPU total</p>
        </div>
      </div>
    </div>
  );
}
