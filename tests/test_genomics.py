import pytest
from services.genomics import main as genomics


def test_import_preserves_evidence_and_is_patient_linked(tmp_path, monkeypatch):
    monkeypatch.setattr(genomics, "DB", tmp_path / "genomics.sqlite3")
    fixture = genomics.demo_vcf("P003")
    request = genomics.ImportVCF(**fixture, consent=True)
    result = genomics.import_vcf("P003", request)
    assert result["sample_id"] == "P003" and result["synthetic"]
    assert len(result["variants"]) == 35
    assert result["variants"][0]["annotation_source"] == "fabricated_demo"
    assert genomics.get_import("P003")["sha256"] == result["sha256"]
    with pytest.raises(Exception):
        genomics.get_import("P004")


@pytest.mark.parametrize(
    "mutation", ["sample", "build", "position", "genotype", "quality", "header"]
)
def test_vcf_invalid_input_rejected(mutation):
    text = genomics.demo_vcf("P001")["vcf"]
    sample, build = "P001", "GRCh38"
    if mutation == "sample":
        sample = "P002"
    if mutation == "build":
        build = "GRCh37"
    if mutation == "position":
        text = text.replace("1000731", "-1")
    if mutation == "genotype":
        text = text.replace("1/1:25", "2/2:25")
    if mutation == "quality":
        text = text.replace("\t35\t", "\tnan\t")
    if mutation == "header":
        text = text.replace("##fileformat=VCFv4.2", "invalid")
    with pytest.raises(ValueError):
        genomics.parse_vcf(text, sample, build)


def test_consent_required():
    with pytest.raises(Exception) as error:
        genomics.import_vcf(
            "P001", genomics.ImportVCF(**genomics.demo_vcf("P001"), consent=False)
        )
    assert error.value.status_code == 422
