
import { getCollection } from '@/lib/mongodb';
import { detectEnactedByPatterns, batchUpdateEnactedStatus } from '@/utils/enacted-legislation';
import { config } from 'dotenv';
import path from 'path';

// Fix imports in utils if needed, or just re-implement pattern check here to be safe and fast.
// Actually, using the shared util is better.
// Assuming the import '@types/legislation' works in this script context (via tsconfig paths).

// Load env
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

async function migrateEnactedStatus() {
    console.log('--- Starting Enacted Status Migration ---');
    const collection = await getCollection('legislation');

    // Fetch all legislation (or just those without enactedAt, but we want to catch missed ones)
    // Stream would be better for memory, but let's grab batches.
    const cursor = collection.find({});

    let processed = 0;
    let updated = 0;

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (!doc) continue;

        processed++;

        // Check if it matches enacted patterns
        const isEnacted = detectEnactedByPatterns(doc);

        if (isEnacted) {
            // Determine enacted date
            // Prefer existing enactedAt if valid
            let enactedDate = doc.enactedAt;

            if (!enactedDate) {
                // Approximate with latestActionAt
                enactedDate = doc.latestActionAt || doc.updatedAt;

                // Update MongoDB
                await collection.updateOne(
                    { _id: doc._id },
                    {
                        $set: {
                            enactedAt: enactedDate,
                            enactedFieldUpdatedAt: new Date()
                        }
                    }
                );
                // console.log(`[UPDATED] ${doc.identifier} marked as Enacted (Date: ${enactedDate})`);
                updated++;
            }
        }

        if (processed % 1000 === 0) {
            console.log(`Processed ${processed} documents...`);
        }
    }

    console.log(`--- Migration Complete ---`);
    console.log(`Total Processed: ${processed}`);
    console.log(`Updated: ${updated}`);

    process.exit(0);
}

migrateEnactedStatus().catch(console.error);
