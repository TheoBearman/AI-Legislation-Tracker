/**
 * Database Cleanup Script - Remove Non-AI Executive Orders
 * 
 * This script removes all executive orders from the database that do NOT contain
 * the phrase "artificial intelligence" in the title, summary, or text.
 * 
 * Usage: npx tsx --env-file=.env.local src/scripts/cleanupNonAIExecutiveOrders.ts [--dry-run]
 */

import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

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

        // Get all executive orders
        const allOrders = await executiveOrders.find({}).toArray();
        console.log(`Found ${allOrders.length} executive orders to check`);

        let removedCount = 0;
        let keptCount = 0;

        for (const order of allOrders) {
            const title = (order.title || '').toLowerCase();
            const summary = (order.summary || '').toLowerCase();

            // Check for explicit AI mentions
            const hasAI =
                title.includes('artificial intelligence') ||
                /\bai\b/i.test(order.title || '') ||
                summary.includes('artificial intelligence') ||
                /\bai\b/i.test(order.summary || '');

            if (!hasAI) {
                if (dryRun) {
                    console.log(`[DRY RUN] Would remove: ${order.number || order.orderNumber || 'No number'}: ${order.title?.substring(0, 80)}...`);
                } else {
                    console.log(`❌ Removing: ${order.number || order.orderNumber || 'No number'}: ${order.title?.substring(0, 80)}...`);
                    await executiveOrders.deleteOne({ _id: order._id });
                }
                removedCount++;
            } else {
                console.log(`✅ Keeping: ${order.number || order.orderNumber || 'No number'}: ${order.title?.substring(0, 80)}...`);
                keptCount++;
            }
        }

        if (dryRun) {
            console.log(`\n[DRY RUN] Would remove ${removedCount} non-AI executive orders`);
            console.log(`[DRY RUN] Would keep ${keptCount} AI-related executive orders`);
        } else {
            console.log(`\n=== Cleanup Complete ===`);
            console.log(`✅ Kept (AI-related): ${keptCount}`);
            console.log(`❌ Removed (non-AI): ${removedCount}`);

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
