import { getCollection } from '@/lib/mongodb';
import { summarizeLegislationOptimized } from '@/services/aiSummaryUtil';
import { Legislation } from '@/types/legislation';
import { config } from 'dotenv';

config({ path: '.env.local' });

const BATCH_SIZE = 10; // Process bills in batches
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds delay between batches

/**
 * Generates AI summaries for bills from January 1, 2024 onwards that don't have summaries.
 * Skips bills that already have a summary from Congress or OpenStates APIs.
 */
async function generateMissingSummaries() {
    console.log('Starting summary generation for bills from 2024 onwards...\n');

    const collection = await getCollection('legislation');

    // Find bills from 2024 onwards without summaries
    const cutoffDate = new Date('2024-01-01T00:00:00Z');

    const query = {
        firstActionAt: { $gte: cutoffDate },
        $or: [
            // No geminiSummary at all
            { geminiSummary: { $in: [null, ''] } },
            // geminiSummary is too short or is the fallback message
            { geminiSummary: { $regex: /^Summary not available due to insufficient information\.?$/i } },
            { $expr: { $lt: [{ $strLenCP: { $ifNull: ['$geminiSummary', ''] } }, 50] } }
        ],
        // Skip bills that have summaries from APIs (Congress or OpenStates)
        $and: [
            {
                $or: [
                    { summaries: { $exists: false } },
                    { summaries: null },
                    { summaries: { $size: 0 } }
                ]
            },
            {
                $or: [
                    { abstracts: { $exists: false } },
                    { abstracts: null },
                    { abstracts: { $size: 0 } },
                    // If abstracts exist but are just the title, we should still generate
                    {
                        $expr: {
                            $allElementsTrue: {
                                $map: {
                                    input: { $ifNull: ['$abstracts', []] },
                                    as: 'abstract',
                                    in: { $lt: [{ $strLenCP: { $ifNull: ['$$abstract.abstract', ''] } }, 100] }
                                }
                            }
                        }
                    }
                ]
            }
        ]
    };

    const bills = await collection.find(query).toArray() as unknown as Legislation[];

    console.log(`Found ${bills.length} bills needing summaries`);

    if (bills.length === 0) {
        console.log('No bills found that need summaries. Exiting.');
        process.exit(0);
    }

    console.log('\nStarting summary generation...\n');

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    // Process in batches to avoid overwhelming the AI service
    for (let i = 0; i < bills.length; i += BATCH_SIZE) {
        const batch = bills.slice(i, i + BATCH_SIZE);

        console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(bills.length / BATCH_SIZE)}...`);

        await Promise.all(
            batch.map(async (bill) => {
                processed++;

                try {
                    console.log(`\n[${processed}/${bills.length}] Processing ${bill.identifier} (${bill.jurisdictionName})`);
                    console.log(`  Title: ${bill.title?.substring(0, 80)}${bill.title && bill.title.length > 80 ? '...' : ''}`);

                    // Generate summaries using the optimized function
                    const result = await summarizeLegislationOptimized(bill);

                    if (!result || result.sourceType === 'none' || !result.summary || result.summary.trim().length < 50) {
                        console.log(`  ⚠️  No suitable content found for summarization`);
                        skipped++;
                        return;
                    }

                    // Update the database with the generated summaries
                    const updateDoc: any = {
                        geminiSummary: result.summary,
                        geminiSummarySource: result.sourceType,
                        updatedAt: new Date()
                    };

                    // Only add longGeminiSummary if it was generated
                    if (result.longSummary) {
                        updateDoc.longGeminiSummary = result.longSummary;
                    }

                    await collection.updateOne(
                        { id: bill.id },
                        { $set: updateDoc }
                    );

                    console.log(`  ✓ Generated summary (${result.summary.length} chars) from ${result.sourceType}`);
                    if (result.longSummary) {
                        console.log(`    + Detailed summary (${result.longSummary.length} chars)`);
                    }
                    succeeded++;

                } catch (error: any) {
                    console.error(`  ✗ Error processing ${bill.identifier}:`, error.message);
                    failed++;
                }
            })
        );

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < bills.length) {
            console.log(`\nWaiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
    }

    console.log('\n=== Summary Generation Complete ===');
    console.log(`Total processed: ${processed}`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Skipped (no content): ${skipped}`);
    console.log(`Failed: ${failed}`);
    console.log(`\nSuccess rate: ${((succeeded / processed) * 100).toFixed(1)}%`);

    process.exit(0);
}

generateMissingSummaries().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
