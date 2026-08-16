import { tagColor } from "../lib/script.js";

export function TagBadge({ tag, className = "", onClick, title }) {
  const { bg, text } = tagColor(tag);
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      className={`badge badge-sm border-0 font-medium ${className}`}
      style={{ backgroundColor: bg, color: text }}
      title={title}
      onClick={onClick}
    >
      {tag}
    </Comp>
  );
}
