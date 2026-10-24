import { useEffect, useMemo, useState } from "react";
import type { Patient } from "./types";
import { ApiError, downloadJson, requestJson } from "./patientService";
import "./genomics-workspace.css";
interface Variant {
  key: string;
  chromosome: string;
  position: number;
  id: string;
  ref: string;
  alt: string;
  quality: number | null;
  filter: string;
  genotype: string;
  depth: string;
  gene: string;
  consequence: string;
  annotation_source: string;
  info: Record<string, string>;
}
interface Import {
  patient_id: string;
  sample_id: string;
  reference_build: string;
  filename: string;
  sha256: string;
  imported_at: string;
  synthetic: boolean;
  annotation_policy: string;
  variants: Variant[];
}
export default function GenomicsWorkspace({ patient }: { patient: Patient }) {
  const [data, setData] = useState<Import | null>(null),
    [text, setText] = useState(""),
    [sample, setSample] = useState(patient.person_id),
    [build, setBuild] = useState("GRCh38"),
    [filename, setFilename] = useState("variants.vcf"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [chrom, setChrom] = useState("all"),
    [selected, setSelected] = useState(""),
    [passOnly, setPassOnly] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setText("");
    setSample(patient.person_id);
    setConsent(false);
    setSelected("");
    setError("");
    setChrom("all");
    requestJson<Import>(`/api/v1/genomics/patients/${patient.person_id}`, {
      signal: c.signal,
    })
      .then(setData)
      .catch((e) => {
        if (
          e.name !== "AbortError" &&
          (!(e instanceof ApiError) || e.status !== 404)
        )
          setError(e.message);
      });
    return () => c.abort();
  }, [patient.person_id]);
  async function demo() {
    setError("");
    try {
      const d = await requestJson<{
        vcf: string;
        sample_id: string;
        reference_build: string;
      }>(`/api/v1/genomics/patients/${patient.person_id}/demo`);
      setText(d.vcf);
      setSample(d.sample_id);
      setBuild(d.reference_build);
      setFilename(`synthetic-${patient.person_id}.vcf`);
      setConsent(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      setData(
        await requestJson<Import>(
          `/api/v1/genomics/patients/${patient.person_id}/vcf`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sample_id: sample,
              reference_build: build,
              consent,
              vcf: text,
              filename,
            }),
          },
        ),
      );
      setSelected("");
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const variants = useMemo(
    () =>
      data?.variants.filter(
        (v) =>
          (chrom === "all" || v.chromosome === chrom) &&
          (!passOnly || v.filter === "PASS") &&
          `${v.gene} ${v.id} ${v.key} ${v.consequence}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ) || [],
    [data, chrom, passOnly, query],
  );
  const variant = data?.variants.find((v) => v.key === selected);
  return (
    <div className="page-stack">
      <section className="paper-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Sample → variants → provenance</span>
            <h2>A genome explorer tied to this profile.</h2>
          </div>
          <span className="subtle-tag">{patient.person_id}</span>
        </div>
        <p className="muted">
          Import a called VCF and inspect its actual alleles, genotypes and
          supplied annotations. Genomic data remains separate from the current
          glucose prediction.
        </p>
        <details open={!data}>
          <summary>Import a VCF sample</summary>
          <div className="genome-import-grid">
            <label>
              VCF file
              <input
                type="file"
                accept=".vcf,text/plain"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 5000000) {
                    setError("Maximum VCF size is 5 MB for this explorer.");
                    return;
                  }
                  setFilename(f.name);
                  setText(await f.text());
                }}
              />
            </label>
            <label>
              Exact VCF sample ID
              <input
                value={sample}
                onChange={(e) => setSample(e.target.value)}
              />
            </label>
            <label>
              Reference build
              <select value={build} onChange={(e) => setBuild(e.target.value)}>
                <option>GRCh38</option>
                <option>GRCh37</option>
              </select>
            </label>
          </div>
          <textarea
            className="genome-vcf"
            aria-label="VCF contents"
            placeholder="Paste VCF v4.x with a #CHROM header and sample genotype column…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <label className="genome-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            I am authorized to link this sample to {patient.person_id} and store
            it locally for this demonstration.
          </label>
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy || !text || !consent}
              onClick={submit}
            >
              {busy ? "Validating…" : "Validate & import"}
            </button>
            <button className="button secondary" onClick={demo}>
              Prepare synthetic VCF example
            </button>
          </div>
          <p className="caption">
            The example contains fabricated loci and annotations. No patient
            genome, pathogenicity or genetic risk is inferred. Imports replace
            this profile’s current local sample.
          </p>
        </details>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
      {data && (
        <>
          <section className="paper-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">
                  {data.synthetic
                    ? "Synthetic format fixture"
                    : "Imported sample"}{" "}
                  · {data.reference_build}
                </span>
                <h2>Chromosome constellation</h2>
              </div>
              <button
                className="button secondary"
                onClick={() =>
                  downloadJson(`variants-${patient.person_id}.json`, data)
                }
              >
                Export sample & provenance
              </button>
            </div>
            <p className="caption">
              Each marker is an imported locus. Tracks share a 0–250 Mb
              coordinate axis; this is a position map, not a sequencing coverage
              or chromosome morphology plot.
            </p>
            <div className="chromosome-map">
              {[
                ...Array.from({ length: 22 }, (_, i) => String(i + 1)),
                "X",
                "Y",
                "MT",
              ].map((c) => (
                <div className="chromosome-track" key={c}>
                  <button
                    className={chrom === c ? "selected" : ""}
                    onClick={() => setChrom(chrom === c ? "all" : c)}
                    aria-label={`Filter chromosome ${c}`}
                  >
                    {c}
                  </button>
                  <svg
                    viewBox="0 0 270 24"
                    role="img"
                    aria-label={`Chromosome ${c} variant positions`}
                  >
                    <line
                      x1="10"
                      y1="12"
                      x2="260"
                      y2="12"
                      stroke="currentColor"
                      opacity=".16"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                    {data.variants
                      .filter((v) => v.chromosome === c)
                      .map((v) => (
                        <g
                          key={v.key}
                          role="button"
                          tabIndex={0}
                          aria-label={`Inspect ${v.key}`}
                          onClick={() => {
                            setSelected(v.key);
                            setChrom(c);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(v.key);
                              setChrom(c);
                            }
                          }}
                        >
                          <title>
                            {v.key} · {v.genotype}
                          </title>
                          <circle
                            cx={10 + v.position / 1000000}
                            cy="12"
                            r={selected === v.key ? 7 : 5}
                            fill={v.filter === "PASS" ? "#62734b" : "#b17d54"}
                            stroke={selected === v.key ? "#252c24" : "none"}
                            strokeWidth="2"
                          />
                        </g>
                      ))}
                  </svg>
                </div>
              ))}
            </div>
            <div className="genome-provenance">
              <span>
                Sample <strong>{data.sample_id}</strong>
              </span>
              <span>{data.variants.length} distinct loci</span>
              <span>{data.filename}</span>
              <code title={data.sha256}>
                SHA-256 {data.sha256.slice(0, 16)}…
              </code>
            </div>
          </section>
          <div className="genome-detail-grid">
            <section className="paper-card">
              <div className="card-heading">
                <h3>Variant browser</h3>
                <span>{variants.length} results</span>
              </div>
              <div className="genome-filters">
                <input
                  aria-label="Search variants"
                  placeholder="Gene, locus, ID or consequence"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  className="button secondary"
                  onClick={() => {
                    setChrom("all");
                    setQuery("");
                    setPassOnly(false);
                  }}
                >
                  Clear filters
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={passOnly}
                    onChange={(e) => setPassOnly(e.target.checked)}
                  />{" "}
                  PASS only
                </label>
              </div>
              <div className="genome-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Locus</th>
                      <th>Alleles</th>
                      <th>GT</th>
                      <th>QUAL</th>
                      <th>Filter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.slice(0, 200).map((v) => (
                      <tr key={v.key}>
                        <td>
                          <button
                            className="text-button"
                            aria-pressed={selected === v.key}
                            onClick={() => setSelected(v.key)}
                          >
                            {v.chromosome}:{v.position.toLocaleString()}
                          </button>
                        </td>
                        <td>
                          {v.ref} → {v.alt}
                        </td>
                        <td>{v.genotype}</td>
                        <td>{v.quality ?? "—"}</td>
                        <td>{v.filter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!variants.length && <p>No loci match these filters.</p>}
              {variants.length > 200 && (
                <p className="caption">
                  Showing first 200 results. Narrow by chromosome or search;
                  export contains all variants.
                </p>
              )}
            </section>
            <aside className="paper-card">
              <span className="eyebrow">Locus inspector</span>
              {variant ? (
                <>
                  <h3>
                    {variant.chromosome}:{variant.position.toLocaleString()}
                  </h3>
                  <div className="allele-change">
                    <span>{variant.ref}</span>
                    <span>→</span>
                    <strong>{variant.alt}</strong>
                  </div>
                  <dl className="genome-facts">
                    <dt>Genotype</dt>
                    <dd>
                      {variant.genotype} (
                      {variant.genotype.includes("|") ? "phased" : "unphased"})
                    </dd>
                    <dt>Read depth</dt>
                    <dd>{variant.depth || "Not supplied"}</dd>
                    <dt>Gene label</dt>
                    <dd>{variant.gene}</dd>
                    <dt>Consequence</dt>
                    <dd>{variant.consequence}</dd>
                    <dt>Annotation source</dt>
                    <dd>{variant.annotation_source}</dd>
                  </dl>
                  <details>
                    <summary>All supplied INFO fields</summary>
                    <pre>{JSON.stringify(variant.info, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <p className="muted">
                  Select a chromosome marker or locus to inspect the imported
                  evidence.
                </p>
              )}
              <p className="caption">{data.annotation_policy}</p>
              <details>
                <summary>Reproducible upstream processing</summary>
                <p className="caption">
                  For FASTQ/BAM studies, run a separately provisioned
                  nf-core/sarek workflow with pinned Nextflow, tool/container
                  versions, reference FASTA/build, sample sheet, consent and QC.
                  Import its resulting VCF here. Raw sequencing, ClinVar/VEP
                  annotation and genetic-risk modelling are not executed by this
                  explorer.
                </p>
                <a
                  href="https://nf-co.re/sarek/docs/usage/"
                  target="_blank"
                  rel="noreferrer"
                >
                  nf-core/sarek workflow documentation
                </a>
              </details>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
