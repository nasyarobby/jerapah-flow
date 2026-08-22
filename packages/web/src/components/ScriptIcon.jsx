import { useEffect, useState } from "react";
import { TbFileTypeJs } from "react-icons/tb";

export function scriptIconSrc(name) {
  return `/api/scripts/${encodeURIComponent(name)}/icon`;
}

/** Same-name PNG/JPG/JPEG next to the script, or a JS document icon. */
export function ScriptIcon({ name, hasIcon, className = "size-10" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [name]);

  const showFile = Boolean(name) && hasIcon !== false && !failed;

  if (!showFile) {
    return <TbFileTypeJs className={`${className} text-warning`} aria-hidden />;
  }

  return (
    <img
      src={scriptIconSrc(name)}
      alt=""
      className={`${className} object-contain`}
      onError={() => setFailed(true)}
    />
  );
}
