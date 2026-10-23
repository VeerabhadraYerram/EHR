import { useEffect, useRef, useState } from "react";
import { ScanLine, Upload, X } from "lucide-react";
import { BrainSlice } from "./MedicalVisuals";
import { organInfo } from "./organDefinitions";
import type { Organ, TwinView } from "./organDefinitions";

type LocalScan = { file: File; url: string };
export default function OrganScans({ view }: { view: TwinView }) {
  const [files, setFiles] = useState<Partial<Record<Organ, LocalScan>>>({});
  const filesRef = useRef(files);
  const [error, setError] = useState("");
  const [plane, setPlane] = useState<"axial" | "coronal" | "sagittal">("axial");
  const [expanded, setExpanded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(
    () => () => {
      Object.values(filesRef.current).forEach((scan) =>
        URL.revokeObjectURL(scan.url),
      );
    },
    [],
  );
  const scan = view !== "body" ? files[view] : undefined;
  const attach = (file?: File) => {
    setError("");
    if (!file || view === "body") return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }
    if (files[view]) URL.revokeObjectURL(files[view]!.url);
    setFiles((previous) => ({
      ...previous,
      [view]: { file, url: URL.createObjectURL(file) },
    }));
  };
  const remove = () => {
    if (view === "body" || !files[view]) return;
    URL.revokeObjectURL(files[view]!.url);
    setFiles((previous) => {
      const next = { ...previous };
      delete next[view];
      return next;
    });
  };
  return (
    <section
      className="dx-panel dx-mri ot-related-scans"
      aria-labelledby="related-scans-heading"
    >
      <header className="dx-panel-heading">
        <h2 id="related-scans-heading">
          {view === "body"
            ? "RELATED SCANS"
            : `${organInfo[view].name.toUpperCase()} / SCANS`}
        </h2>
        <span className="dx-panel-tag">LOCAL PREVIEW</span>
      </header>
      {view === "body" ? (
        <div className="ot-scan-empty">
          <ScanLine size={25} />
          <strong>Select an organ</strong>
          <p>Its related scans appear here.</p>
        </div>
      ) : (
        <>
          {scan ? (
            <div className={`ot-uploaded-scan ${expanded ? "expanded" : ""}`}>
              <button
                className="ot-scan-image-button"
                aria-label={
                  expanded ? "Fit local scan image" : "Enlarge local scan image"
                }
                onClick={() => setExpanded(!expanded)}
              >
                <img
                  src={scan.url}
                  alt={`Locally selected ${organInfo[view].name.toLowerCase()} image: ${scan.file.name}`}
                  onError={() =>
                    setError(
                      "This image could not be displayed. Choose another image.",
                    )
                  }
                />
              </button>
              <span>LOCAL IMAGE · NO INTERPRETATION</span>
              <button
                className="ot-remove-scan"
                onClick={remove}
                aria-label="Remove local scan"
              >
                <X size={13} />
              </button>
            </div>
          ) : view === "brain" ? (
            <>
              <div className="ot-brain-scan">
                <BrainSlice plane={plane} active />
              </div>
              <div
                className="ot-plane-picker"
                role="group"
                aria-label="Brain MRI illustration plane"
              >
                {(["axial", "coronal", "sagittal"] as const).map((p) => (
                  <button
                    key={p}
                    aria-pressed={plane === p}
                    onClick={() => setPlane(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className="ot-scan-caption">
                ILLUSTRATIVE MRI ANATOMY · NOT A PATIENT SCAN
              </p>
            </>
          ) : (
            <div className="ot-scan-empty">
              <ScanLine size={25} />
              <strong>{organInfo[view].scan}</strong>
              <p>No scan attached to this demo.</p>
            </div>
          )}
          <div className="ot-scan-upload">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={`Choose ${organInfo[view].name.toLowerCase()} scan image`}
              onChange={(e) => {
                attach(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => {
                setError("");
                fileInput.current?.click();
              }}
            >
              <Upload size={12} />
              {scan ? "Replace image" : "Open local image"}
            </button>
            <small>PNG / JPEG / WEBP · STAYS IN THIS BROWSER</small>
          </div>
          {error && (
            <p className="ot-scan-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
