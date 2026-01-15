
import { config } from 'dotenv';
import path from 'path';
import { getCollection } from '@/lib/mongodb';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    const legislationCollection = await getCollection('legislation');

    // Count total bills
    const totalBills = await legislationCollection.countDocuments({});
    console.log(`Total bills in DB: ${totalBills}`);

    // Count state bills (assuming they have jurisdictionId)
    // Federal bills might not have jurisdictionId or it might be 'Federal'
    const stateBills = await legislationCollection.countDocuments({
        jurisdictionId: { $ne: null }
    });
    console.log(`State bills: ${stateBills}`);

    // Count AI bills (check for ai_keywords match if possible, or just recent ones)
    // Checking bills with 'artificial intelligence' in title
    const aiTitleBills = await legislationCollection.countDocuments({
        title: { $regex: 'artificial intelligence', $options: 'i' }
    });
    console.log(`Bills with 'artificial intelligence' in title: ${aiTitleBills}`);

    // Sample recent state bills
    const samples = await legislationCollection.find({ jurisdictionId: { $ne: null } })
        .sort({ updatedAt: -1 })
        .limit(5)
        .toArray();

    console.log('\n--- Sample 5 Recent State Bills ---');
    samples.forEach(bill => {
        console.log(`[${bill.jurisdictionName}] ${bill.identifier}: ${bill.title.substring(0, 100)}...`);
    });

    process.exit(0);
}

main().catch(console.error);
