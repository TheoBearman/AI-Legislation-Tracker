import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';

config({ path: '.env.local' });

const CONGRESS_API_KEY = process.env.US_CONGRESS_API_KEY;
const CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (response.status === 429) {
                console.log('  Rate limited, waiting 60s...');
                await delay(60000);
                continue;
            }
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            await delay(1000 * (i + 1));
        }
    }
    throw new Error('Max retries exceeded');
}

async function backfillSummaries() {
    const collection = await getCollection('legislation');

    // Find all Congress bills without summaries
    const bills = await collection.find({
        id: { $regex: /^congress-bill-/ },
        $or: [
            { summaries: { $exists: false } },
            { summaries: { $size: 0 } },
            { summaries: null }
        ]
    }).toArray();

    console.log(`Found ${bills.length} bills without summaries\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const bill of bills) {
        try {
            // Extract congress, type, and number from ID
            const match = bill.id.match(/^congress-bill-(\d+)-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-(\d+)$/);
            if (!match) {
                console.log(`✗ Could not parse bill ID: ${bill.id}`);
                errors++;
                continue;
            }

            const [, congress, type, number] = match;

            console.log(`Fetching summaries for ${bill.identifier}...`);

            const summariesUrl = `${CONGRESS_API_BASE_URL}/bill/${congress}/${type}/${number}/summaries?api_key=${CONGRESS_API_KEY}&format=json`;
            const response = await fetchWithRetry(summariesUrl);

            if (!response.ok) {
                console.log(`  ✗ Failed to fetch (${response.status})`);
                errors++;
                await delay(500);
                continue;
            }

            const data: any = await response.json();
            const summaries = data.summaries || [];

            if (summaries.length === 0) {
                console.log(`  - No summaries available`);
                skipped++;
            } else {
                // Update the bill with summaries
                await collection.updateOne(
                    { id: bill.id },
                    { $set: { summaries } }
                );
                console.log(`  ✓ Added ${summaries.length} summaries`);
                updated++;
            }

            // Rate limiting - be conservative
            await delay(500);

        } catch (error) {
            console.error(`✗ Error processing ${bill.identifier}:`, error);
            errors++;
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (no summaries available): ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total processed: ${bills.length}`);
}

backfillSummaries()
    .then(() => {
        console.log('\nBackfill complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Backfill failed:', error);
        process.exit(1);
    });
