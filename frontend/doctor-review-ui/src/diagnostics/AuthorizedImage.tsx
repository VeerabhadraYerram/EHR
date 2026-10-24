import { useEffect, useState } from "react";
import { authEnabled } from "../auth";
export default function AuthorizedImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState("");
  useEffect(() => {
    if (!authEnabled) return;
    const c = new AbortController();
    let url = "";
    setObjectUrl("");
    fetch(src, { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Image unavailable");
        return r.blob();
      })
      .then((b) => {
        if (!c.signal.aborted) {
          url = URL.createObjectURL(b);
          setObjectUrl(url);
        }
      })
      .catch(() => {});
    return () => {
      c.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);
  return (
    <img
      className={className}
      src={authEnabled ? objectUrl || undefined : src}
      alt={alt}
    />
  );
}
