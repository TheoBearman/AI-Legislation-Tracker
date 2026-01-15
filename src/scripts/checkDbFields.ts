import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function check() {
    const collection = await getCollection('legislation');
    const bill = await collection.findOne({ id: 'congress-bill-119-hr-1229' });

    console.log('\n=== ABSTRACTS field ===');
    console.log(JSON.stringify(bill?.abstracts, null, 2));

    console.log('\n=== SUMMARIES field ===');
    console.log('Has summaries:', !!bill?.summaries);
    console.log('Count:', bill?.summaries?.length);
    if (bill?.summaries?.[0]) {
        console.log('First 300 chars:', bill.summaries[0].text?.substring(0, 300));
    }

    process.exit(0);
}

check();
