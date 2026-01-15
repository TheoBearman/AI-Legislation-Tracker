import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function checkBills() {
    const aiRegex = /\bai\b|artificial intelligence/i;

    const collection = await getCollection('legislation');
    const bill = await collection.findOne({ id: 'congress-bill-119-hr-1229' });

    if (!bill) {
        console.log('Bill not found in database (may have been removed)');
        process.exit(0);
    }

    console.log(`\n=== ${bill.identifier} ===`);
    console.log(`Title: ${bill.title}`);
    console.log(`\nAvailable fields:`);
    console.log(`- Has summaries: ${!!bill.summaries} (count: ${bill.summaries?.length || 0})`);
    console.log(`- Has abstract: ${!!bill.abstract}`);

    console.log(`\nFull bill object (truncated):`);
    console.log(JSON.stringify(bill, null, 2).substring(0, 2000));

    process.exit(0);
}

checkBills().catch(console.error);
