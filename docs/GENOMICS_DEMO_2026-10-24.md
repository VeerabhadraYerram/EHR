# Synthetic genomics demo

Open **Genomics explorer → Open synthetic diabetes demo**. Profiles without a
saved import open the preview automatically. Existing imports are retained; use
**Return to imported sample** to switch back. The preview does not write to the
genomics database or affect glucose predictions.

## Suggested video walkthrough

1. Show the synthetic banner, three targeted reference loci, two PASS examples
   and one QC warning. This is a small research panel, not whole-genome sequencing.
2. For P001, show TCF7L2 C/T (heterozygous), SLC30A8 T/T (homozygous alternate)
   and KCNJ11 T/T (homozygous reference, low-quality example).
3. Select **Inspect TCF7L2 evidence**. Explain GT, read depth, reference/alternate
   allele counts and the linked annotation/source paper.
4. Inspect KCNJ11 and explain why low-quality calls should not be interpreted.
   Toggle PASS only to demonstrate exclusion from the filtered variant table.
5. Optionally switch to another profile: deterministic calls differ, without
   pretending that BMI, HbA1c or recorded sex can establish a genome.
6. Export sample/provenance JSON. Standalone VCF examples for P001, P002 and P043
   are in data/samples/genomics/ and can be imported through the existing consented
   VCF workflow. Importing VCF does not reproduce the preview's curated UI context.

## What is sourced and what is synthetic

Public reference coordinates, alleles and allele-specific consequences were
checked against Ensembl Variation REST and VEP on 24 October 2026 and stored in
services/genomics/demo_loci.json. Genotypes, QUAL, FILTER, DP and AD are generated
fixtures. They are not sequence measurements from the cohort. AD counts sum to DP.
The seed is the demonstration profile ID; there is no learned genomic model.

| rsID | Gene | GRCh38 forward reference/alternate | Consequence of selected ALT |
| --- | --- | --- | --- |
| rs7903146 | TCF7L2 | 10:112998590 C>T | intron_variant |
| rs13266634 | SLC30A8 | 8:117172544 C>T | missense_variant |
| rs5219 | KCNJ11 | 11:17388025 T>C | missense_variant |

The rsIDs have multiple alternate alleles in reference databases. The fixture
uses the specific alleles above and allele-specific VEP queries, rather than
copying the most severe consequence across all alternate alleles. A 0/0 genotype
does not mean the alternate allele was observed, regardless of its annotation.

Primary research context: [Indian-population study of diabetes research loci](https://pmc.ncbi.nlm.nih.gov/articles/PMC4911058/).
The paper includes these loci and does not establish an individual risk score or
uniform effects across populations. No pathogenicity classification, genetic
risk percentage or medication recommendation is calculated.

Reference URLs and exact VEP queries are linked in the app and saved with each
demo locus. The demonstration works offline once its local service is running;
only opening external source links needs internet access.

## Verification

Ten genomics tests pass: existing import/consent/build/sample validation plus
curated coordinates/alleles, allele-specific annotations, repeatability, differing
profile calls, QC examples, allele-depth totals and saved-sample preservation.
Production build and lint pass. Browser inspection verifies the three-locus
preview and source inspector. No actual genome was downloaded or assigned.
