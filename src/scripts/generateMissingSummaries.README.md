# Generate Missing AI Summaries

This script generates AI-powered summaries for legislation from January 1, 2024 onwards that doesn't have summaries available from Congress.gov or OpenStates APIs.

## What It Does

1. **Finds bills needing summaries**: Queries the database for bills from 2024+ that either:
   - Have no `geminiSummary` 
   - Have a very short summary (< 50 characters)
   - Have the fallback "Summary not available" message
   - Don't have API summaries already (from `summaries` or `abstracts` fields)

2. **Generates AI summaries**: Uses the OpenRouter API (configured via environment variables) to:
   - Extract the best available text from bills (PDFs, full text, abstracts, or titles)
   - Generate concise ~100-word summaries
   - Optionally generate detailed multi-paragraph analyses for rich sources

3. **Updates the database**: Stores:
   - `geminiSummary`: The brief AI-generated summary
   - `geminiSummarySource`: Source type used (e.g., 'pdf-extracted', 'abstracts', 'title')
   - `longGeminiSummary`: Detailed analysis (if generated from rich sources)

## Prerequisites

Ensure you have the following environment variables set in `.env.local`:

```env
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=google/gemini-2.0-flash-001  # or your preferred model
MONGODB_URI=your_mongodb_connection_string
```

## Usage

```bash
npx tsx src/scripts/generateMissingSummaries.ts
```

## Process

- Bills are processed in batches of 10 to avoid overwhelming the AI service
- 2-second delay between batches to respect rate limits
- Progress is logged for each bill showing:
  - Bill identifier and jurisdiction
  - Whether summary was generated
  - Source type used for summarization
  - Character count of generated summaries

## Output Example

```
Found 234 bills needing summaries

Processing batch 1/24...

[1/234] Processing HR 1234 (California)
  Title: An Act to establish artificial intelligence safety standards...
  ✓ Generated summary (387 chars) from pdf-extracted
    + Detailed summary (1423 chars)

[2/234] Processing SB 567 (Texas)
  Title: An Act relating to data privacy...
  ✓ Generated summary (312 chars) from abstracts
```

## Technical Details

The script uses the existing `summarizeLegislationOptimized` function which:
- Tries to extract PDF content from bill sources
- Falls back to full text, then abstracts, then title
- Handles jurisdiction-specific extraction (Congress, California, Texas, etc.)
- Generates appropriate summaries based on source richness

## Rate Limiting

- Batch size: 10 bills
- Delay between batches: 2000ms (2 seconds)
- Adjust these in the script if needed for higher/lower throughput

## Filtering Logic

Bills are included if they meet ALL criteria:
1. `firstActionAt >= 2024-01-01`
2. Missing or insufficient `geminiSummary`
3. No usable API summaries in `summaries` or `abstracts` fields

This ensures we only generate summaries where they're truly needed.
