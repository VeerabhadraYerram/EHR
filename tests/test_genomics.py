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


def test_research_demo_uses_verified_alleles_and_reproducible_synthetic_calls():
    demo = genomics.diabetes_demo('P001')
    assert demo == genomics.diabetes_demo('P001')
    assert demo['synthetic'] and demo['preview_only']
    assert demo['sample_id'] == 'P001' and demo['reference_build'] == 'GRCh38'
    rows = demo['variants']
    assert [(v['id'], v['position'], v['ref'], v['alt']) for v in rows] == [
        ('rs7903146', 112998590, 'C', 'T'),
        ('rs13266634', 117172544, 'C', 'T'),
        ('rs5219', 17388025, 'T', 'C'),
    ]
    assert [v['consequence'] for v in rows] == ['intron_variant', 'missense_variant', 'missense_variant']
    assert len([v for v in rows if v['filter'] == 'PASS']) == 2
    assert len({v['genotype'] for v in rows}) == 3
    for v in rows:
        assert sum(map(int, v['allele_depths'].split(','))) == int(v['depth'])
        assert v['research']['annotation_url'].startswith('https://rest.ensembl.org/vep/')
    assert genomics.diabetes_demo('P002')['variants'][0]['genotype'] != rows[0]['genotype']


def test_demo_preview_does_not_replace_saved_sample(tmp_path, monkeypatch):
    monkeypatch.setattr(genomics, 'DB', tmp_path / 'genomics.sqlite3')
    saved = genomics.import_vcf('P001', genomics.ImportVCF(**genomics.demo_vcf('P001'), consent=True))
    genomics.diabetes_demo('P001')
    assert genomics.get_import('P001')['sha256'] == saved['sha256']
    genomics.diabetes_demo('P002')
    with pytest.raises(Exception) as missing:
        genomics.get_import('P002')
    assert missing.value.status_code == 404
