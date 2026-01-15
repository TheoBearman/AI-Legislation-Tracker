import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';
import path from 'path';

// Load env vars
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Keep ONLY bills that explicitly mention "AI" or "artificial intelligence"
 * in their title or abstract/summary
 */
async function strictAIFilter() {
    console.log('\n=== Strict AI Filter - Keep Only Explicit AI Mentions ===\n');

    const collection = await getCollection('legislation');

    // Get all legislation
    const allBills = await collection.find({}).toArray();
    console.log(`Total bills in database: ${allBills.length}`);

    let removedCount = 0;
    let keptCount = 0;
    const removedBills: any[] = [];

    for (const bill of allBills) {
        const title = (bill.title || '').toLowerCase();
        const summary = (bill.summary || '').toLowerCase();

        // Check abstracts
        let abstractText = '';
        if (bill.abstracts && Array.isArray(bill.abstracts)) {
            abstractText = bill.abstracts
                .map((a: any) => a.abstract || '')
                .join(' ')
                .toLowerCase();
        }

        // Combine all text
        const allText = `${title} ${summary} ${abstractText}`;

        // Check for explicit AI mentions
        const hasAI =
            allText.includes('artificial intelligence') ||
            /\bai\b/i.test(title) ||
            /\bai\b/i.test(summary) ||
            /\bai\b/i.test(abstractText);

        if (!hasAI) {
            // Remove this bill
            removedBills.push({
                id: bill.id,
                identifier: bill.identifier,
                title: bill.title?.substring(0, 100),
                jurisdiction: bill.jurisdictionName
            });

            await collection.deleteOne({ _id: bill._id });
            removedCount++;

            console.log(`❌ Removed: ${bill.jurisdictionName} ${bill.identifier} - ${bill.title?.substring(0, 60)}...`);
        } else {
            keptCount++;
        }
    }

    console.log('\n=== Strict Filter Complete ===');
    console.log(`Total bills processed: ${allBills.length}`);
    console.log(`✅ Kept (explicit AI mention): ${keptCount}`);
    console.log(`❌ Removed (no explicit AI mention): ${removedCount}`);

    if (removedBills.length > 0) {
        console.log('\n=== Removed Bills Summary ===');
        const byJurisdiction: Record<string, number> = {};

        for (const bill of removedBills) {
            const jurisdiction = bill.jurisdiction || 'Unknown';
            byJurisdiction[jurisdiction] = (byJurisdiction[jurisdiction] || 0) + 1;
        }

        console.log('\nBy Jurisdiction:');
        for (const [jurisdiction, count] of Object.entries(byJurisdiction).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${jurisdiction}: ${count} bills`);
        }

        // Show first 20 removed bills as examples
        console.log('\nExamples of removed bills:');
        for (const bill of removedBills.slice(0, 20)) {
            console.log(`  - ${bill.jurisdiction} ${bill.identifier}: ${bill.title}`);
        }

        if (removedBills.length > 20) {
            console.log(`  ... and ${removedBills.length - 20} more`);
        }
    }

    process.exit(0);
}

strictAIFilter().catch((error) => {
    console.error('Error during strict filtering:', error);
    process.exit(1);
});
