/**
 * Database Cleanup Script - Remove Non-AI Legislation
 * 
 * This script removes all legislation from the database that does NOT contain
 * the phrase "artificial intelligence" in the title, summary, or geminiSummary.
 * 
 * Usage: npx tsx --env-file=.env.local src/scripts/cleanupNonAILegislation.ts [--dry-run]
 */

import { MongoClient } from 'mongodb';

const AI_PATTERN = /artificial intelligence/i;

async function cleanupNonAILegislation(dryRun: boolean = false) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(process.env.MONGODB_DB_NAME || 'statepulse');
        const legislation = db.collection('legislation');

        // Count total legislation
        const totalCount = await legislation.countDocuments();
        console.log(`Total legislation in database: ${totalCount}`);

        // Find legislation that does NOT match AI criteria
        const nonAIQuery = {
            $and: [
                { title: { $not: AI_PATTERN } },
                { summary: { $not: AI_PATTERN } },
                { geminiSummary: { $not: AI_PATTERN } },
                { 'abstracts.abstract': { $not: AI_PATTERN } }
            ]
        };

        const nonAICount = await legislation.countDocuments(nonAIQuery);
        console.log(`Non-AI legislation to remove: ${nonAICount}`);

        // Count AI legislation for verification
        const aiCount = totalCount - nonAICount;
        console.log(`AI legislation to keep: ${aiCount}`);

        if (dryRun) {
            console.log('\n[DRY RUN] No changes made. Run without --dry-run to execute deletion.');

            // Show some examples of what would be deleted
            const samples = await legislation.find(nonAIQuery).limit(5).toArray();
            console.log('\nSample non-AI bills that would be deleted:');
            samples.forEach(bill => {
                console.log(`  - ${bill.identifier || bill.id}: ${bill.title?.substring(0, 80)}...`);
            });
        } else {
            // Delete non-AI legislation
            console.log('\nDeleting non-AI legislation...');
            const result = await legislation.deleteMany(nonAIQuery);
            console.log(`Deleted ${result.deletedCount} non-AI legislation documents.`);

            // Verify remaining count
            const remainingCount = await legislation.countDocuments();
            console.log(`Remaining legislation in database: ${remainingCount}`);
        }

    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    } finally {
        await client.close();
    }
}

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

cleanupNonAILegislation(dryRun);
