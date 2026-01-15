/**
 * Database Cleanup Script - Remove Non-AI Executive Orders
 * 
 * This script removes all executive orders from the database that do NOT contain
 * the phrase "artificial intelligence" in the title, summary, or text.
 * 
 * Usage: npx tsx --env-file=.env.local src/scripts/cleanupNonAIExecutiveOrders.ts [--dry-run]
 */

import { MongoClient } from 'mongodb';

const AI_PATTERN = /artificial intelligence/i;

async function cleanupNonAIExecutiveOrders(dryRun: boolean = false) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(process.env.MONGODB_DB_NAME || 'statepulse');
        const executiveOrders = db.collection('executive_orders');

        // Count total executive orders
        const totalCount = await executiveOrders.countDocuments();
        console.log(`Total executive orders in database: ${totalCount}`);

        // Find executive orders that do NOT match AI criteria
        const nonAIQuery = {
            $and: [
                { title: { $not: AI_PATTERN } },
                { summary: { $not: AI_PATTERN } },
                { full_text: { $not: AI_PATTERN } },
                { geminiSummary: { $not: AI_PATTERN } }
            ]
        };

        const nonAICount = await executiveOrders.countDocuments(nonAIQuery);
        console.log(`Non-AI executive orders to remove: ${nonAICount}`);

        // Count AI executive orders for verification
        const aiCount = totalCount - nonAICount;
        console.log(`AI executive orders to keep: ${aiCount}`);

        if (dryRun) {
            console.log('\n[DRY RUN] No changes made. Run without --dry-run to execute deletion.');

            // Show some examples of what would be deleted
            const samples = await executiveOrders.find(nonAIQuery).limit(5).toArray();
            console.log('\nSample non-AI executive orders that would be deleted:');
            samples.forEach(order => {
                console.log(`  - ${order.orderNumber || order.id}: ${order.title?.substring(0, 80)}...`);
            });
        } else {
            // Delete non-AI executive orders
            console.log('\nDeleting non-AI executive orders...');
            const result = await executiveOrders.deleteMany(nonAIQuery);
            console.log(`Deleted ${result.deletedCount} non-AI executive order documents.`);

            // Verify remaining count
            const remainingCount = await executiveOrders.countDocuments();
            console.log(`Remaining executive orders in database: ${remainingCount}`);
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

cleanupNonAIExecutiveOrders(dryRun);
