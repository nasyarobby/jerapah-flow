export function OpsStatusCard({ title, children, actions }) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4">
        <h2 className="card-title text-lg">{title}</h2>
        {children}
        {actions ? <div className="card-actions justify-start px-0">{actions}</div> : null}
      </div>
    </div>
  );
}
