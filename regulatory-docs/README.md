# Regulatory Documents

This directory contains the source PDF documents for regulatory ingestion.

## Files

- `childcare_centers_regulations.pdf` - Arkansas Childcare Centers Regulations
- `nursing_home_regulations.pdf` - Arkansas Nursing Home Regulations  
- `nursing_home_administrators_licensing_rules.pdf` - Arkansas Nursing Home Administrators Licensing Rules

## Usage

To process these documents and populate the database:

```bash
npm run ingest
```

This will:
1. Extract text from all PDFs using pdf2json
2. Chunk text at sentence boundaries (~1000 chars)
3. Generate 1536-dimension embeddings with OpenAI
4. Store in Supabase `regulatory_knowledge` table
5. Run AI discovery to extract compliance criteria
6. Populate `compliance_criteria` table

## Requirements

- Node.js environment with access to `.env.local`
- OpenAI API key configured
- Supabase connection configured
- All 3 PDF files present in this directory
