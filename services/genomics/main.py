"""VCF ingestion boundary. No genetic risk or clinical variant classification inferred."""

import hashlib
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
DB = Path(os.environ.get("GENOMICS_DB", ROOT / "data/genomics/variants.sqlite3"))
app = FastAPI(title="Patient-linked VCF explorer")
PREFIX = "/api/v1/genomics"


class ImportVCF(BaseModel):
    sample_id: str = Field(min_length=1, max_length=100)
    reference_build: str
    consent: bool
    vcf: str = Field(min_length=10, max_length=5000000)
    filename: str = Field(default="variants.vcf", max_length=200)


def parse_vcf(text, sample, build):
    if build not in ("GRCh37", "GRCh38"):
        raise ValueError("Select GRCh37 or GRCh38 explicitly")
    if not text.startswith("##fileformat=VCFv4."):
        raise ValueError("Expected a VCF v4.x header")
    reference = re.search(r"^##reference=(.+)$", text, re.M)
    if reference:
        ref = reference[1].strip()
        known = (
            "GRCh38"
            if re.search("GRCh38|hg38", ref, re.I)
            else "GRCh37" if re.search("GRCh37|hg19", ref, re.I) else None
        )
        if known and known != build:
            raise ValueError(
                "VCF reference header conflicts with selected genome build"
            )
    lines = text.splitlines()
    header = next(
        (line.split("\t") for line in lines if line.startswith("#CHROM\t")), None
    )
    if not header or len(header) < 10 or sample not in header[9:]:
        raise ValueError(
            "Sample identity must exactly match a sample column in this VCF"
        )
    column = header.index(sample)
    variants = []
    seen = set()
    for number, line in enumerate(lines, 1):
        if not line or line.startswith("#"):
            continue
        cells = line.split("\t")
        if len(cells) != len(header):
            raise ValueError(f"Line {number}: column count does not match header")
        chrom, position, identifier, ref, alt, quality, filt, raw = cells[:8]
        chrom = chrom.removeprefix("chr")
        if chrom not in [str(i) for i in range(1, 23)] + ["X", "Y", "MT", "M"]:
            raise ValueError(f"Line {number}: unsupported primary chromosome")
        if not position.isdigit() or int(position) < 1 or int(position) > 250000000:
            raise ValueError(f"Line {number}: invalid genomic position")
        if not re.fullmatch("[ACGTN]+", ref, re.I) or not all(
            re.fullmatch(r"[ACGTN]+|<[^>]+>|\*", a, re.I) for a in alt.split(",")
        ):
            raise ValueError(f"Line {number}: invalid REF/ALT allele")
        try:
            q = None if quality == "." else float(quality)
            if q is not None and (q < 0 or q == float("inf") or q != q):
                raise ValueError()
        except ValueError:
            raise ValueError(f"Line {number}: invalid QUAL")
        info = dict(
            (item.split("=", 1) + ["true"])[:2]
            for item in raw.split(";")
            if item != "."
        )
        fmt = dict(zip(cells[8].split(":"), cells[column].split(":")))
        genotype = fmt.get("GT", "./.")
        if not re.fullmatch(r"(\d+|\.)([/|](\d+|\.))*", genotype):
            raise ValueError(f"Line {number}: invalid genotype")
        if any(
            int(a) > len(alt.split(","))
            for a in re.split(r"[/|]", genotype)
            if a != "."
        ):
            raise ValueError(f"Line {number}: genotype allele index exceeds ALT count")
        key = (chrom, position, ref, alt)
        if key in seen:
            continue
        seen.add(key)
        variants.append(
            {
                "key": ":".join(key),
                "chromosome": chrom,
                "position": int(position),
                "id": identifier,
                "ref": ref,
                "alt": alt,
                "quality": q,
                "filter": filt,
                "genotype": genotype,
                "depth": fmt.get("DP"),
                "allele_depths": fmt.get("AD"),
                "info": info,
                "gene": info.get("GENE", info.get("SYMBOL", "Unannotated")),
                "consequence": info.get("CONSEQUENCE", "Unannotated"),
                "annotation_source": info.get(
                    "ANNOTATION_SOURCE",
                    "VCF supplied annotations; not independently verified",
                ),
            }
        )
        if len(variants) > 20000:
            raise ValueError(
                "Round-one explorer supports up to 20,000 distinct variants"
            )
    if not variants:
        raise ValueError("VCF contains no variants")
    return variants


def database():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB)
    db.execute(
        "CREATE TABLE IF NOT EXISTS imports (patient_id TEXT PRIMARY KEY, content TEXT NOT NULL, raw_vcf TEXT NOT NULL)"
    )
    return db


def valid_patient(patient_id):
    if not re.fullmatch(r"P\d{3}", patient_id) or not 1 <= int(patient_id[1:]) <= 100:
        raise HTTPException(404, "Unknown cohort profile")


@app.get("/health")
def health():
    return {"status": "ok", "service": "genomics", "risk_prediction": False}


@app.get(PREFIX + "/patients/{patient_id}")
def get_import(patient_id: str):
    valid_patient(patient_id)
    with database() as db:
        row = db.execute(
            "SELECT content FROM imports WHERE patient_id=?", (patient_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "No consented VCF imported for this profile")
    return json.loads(row[0])


@app.post(PREFIX + "/patients/{patient_id}/vcf")
def import_vcf(patient_id: str, request: ImportVCF):
    valid_patient(patient_id)
    if not request.consent:
        raise HTTPException(
            422, "Explicit authorization/consent for this sample is required"
        )
    try:
        variants = parse_vcf(request.vcf, request.sample_id, request.reference_build)
    except ValueError as error:
        raise HTTPException(422, str(error))
    result = {
        "patient_id": patient_id,
        "sample_id": request.sample_id,
        "reference_build": request.reference_build,
        "filename": request.filename,
        "sha256": hashlib.sha256(request.vcf.encode()).hexdigest(),
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "consent_recorded": True,
        "synthetic": "##synthetic=true" in request.vcf,
        "annotation_policy": "Display supplied annotations with source. No pathogenicity, diabetes risk or drug response is inferred.",
        "pipeline": "VCF validation/import v1; variant calling and annotation are upstream responsibilities",
        "variants": variants,
    }
    with database() as db:
        db.execute(
            "INSERT INTO imports VALUES(?,?,?) ON CONFLICT(patient_id) DO UPDATE SET content=excluded.content,raw_vcf=excluded.raw_vcf",
            (patient_id, json.dumps(result), request.vcf),
        )
    return result


@app.get(PREFIX + "/patients/{patient_id}/demo")
def demo_vcf(patient_id: str):
    valid_patient(patient_id)
    # All loci and gene labels below are fabricated format fixtures, not clinical variants.
    seed = int(patient_id[1:])
    header = f"##fileformat=VCFv4.2\n##reference=GRCh38\n##synthetic=true\n##source=EHR-Twin-format-fixture\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t{patient_id}\n"
    lines = [
        f'{1+i%22}\t{1000000+(i*1754311+seed*731)%100000000}\t.\tA\tG\t{35+i%50}\t{"LowQual" if i%7==0 else "PASS"}\tGENE=DEMO_{i+1};CONSEQUENCE=synthetic_fixture;ANNOTATION_SOURCE=fabricated_demo\tGT:DP\t{"1/1" if i%4==0 else "0/1"}:{25+i%60}'
        for i in range(32 + seed % 12)
    ]
    return {
        "vcf": header + "\n".join(lines) + "\n",
        "sample_id": patient_id,
        "reference_build": "GRCh38",
    }


@app.get(PREFIX + "/patients/{patient_id}/demo/diabetes")
def diabetes_demo(patient_id: str):
    """Read-only targeted panel: public reference metadata, fabricated calls/QC."""
    valid_patient(patient_id)
    panel = json.loads((Path(__file__).with_name('demo_loci.json')).read_text())
    seed = int(patient_id[1:])
    header = [
        '##fileformat=VCFv4.2', '##reference=GRCh38', '##synthetic=true',
        '##source=EHR-Twin-diabetes-research-demo-v1',
        '##INFO=<ID=GENE,Number=1,Type=String,Description="Gene label from curated reference metadata">',
        '##INFO=<ID=CONSEQUENCE,Number=1,Type=String,Description="Allele-specific Ensembl VEP snapshot">',
        '##INFO=<ID=ANNOTATION_SOURCE,Number=1,Type=String,Description="Reference annotation source">',
        '##FILTER=<ID=LowQual,Description="Synthetic low-quality example for QC demonstration">',
        '##FORMAT=<ID=GT,Number=1,Type=String,Description="Fabricated genotype">',
        '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Fabricated read depth">',
        '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Fabricated reference and alternate read counts">',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t' + patient_id,
    ]
    records = []
    for i, locus in enumerate(panel['loci']):
        gt = ['0/0', '0/1', '1/1'][(seed + i) % 3]
        depth = 48 + (seed * 7 + i * 13) % 45
        low_quality = i == 2
        if low_quality:
            depth = 8 + seed % 5
        alt_depth = round(depth * {'0/0': 0, '0/1': .48, '1/1': 1}[gt])
        qual = 18 if low_quality else 145 + (seed + i * 17) % 70
        records.append('\t'.join(map(str, [locus['chromosome'], locus['position'],
            locus['rsid'], locus['ref'], locus['alt'], qual,
            'LowQual' if low_quality else 'PASS',
            f"GENE={locus['gene']};CONSEQUENCE={locus['consequence']};ANNOTATION_SOURCE=Ensembl_VEP_snapshot_2026-10-24",
            'GT:DP:AD', f'{gt}:{depth}:{depth-alt_depth},{alt_depth}'])))
    vcf = '\n'.join(header + records) + '\n'
    variants = parse_vcf(vcf, patient_id, 'GRCh38')
    for variant, locus in zip(variants, panel['loci']):
        variant['research'] = {
            'context': locus['context'], 'reference_url': locus['reference_url'],
            'annotation_url': locus['annotation_url'], 'literature_url': locus['literature_url'],
            'fetched_on': locus['fetched_on'],
        }
    return {
        'patient_id': patient_id, 'sample_id': patient_id, 'reference_build': 'GRCh38',
        'filename': f'synthetic-diabetes-panel-{patient_id}.vcf',
        'sha256': hashlib.sha256(vcf.encode()).hexdigest(),
        'synthetic': True, 'demo_panel': 'diabetes-research-v1', 'preview_only': True,
        'imported_at': None, 'vcf': vcf, 'variants': variants,
        'annotation_policy': 'Public reference loci and allele-specific VEP annotations; genotypes, quality and depth are fabricated. No patient genetic risk, pathogenicity or drug response is inferred.',
        'pipeline': 'Deterministic synthetic VCF → exact-sample/build validation → parsed genotype/QC evidence; no database writes.',
    }


# Cross-cutting OIDC authorization and local access audit.
import sys as _sys
from pathlib import Path as _Path

_security_root = next(
    (p for p in _Path(__file__).resolve().parents if (p / "ehr_security.py").exists()),
    _Path(__file__).resolve().parent,
)
_sys.path.insert(0, str(_security_root))
from ehr_security import install_security

install_security(app, "genomics")
