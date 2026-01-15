import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function checkDB() {
    const collection = await getCollection('legislation');
    const bill = await collection.findOne({ id: 'congress-bill-119-hr-1229' });

    if (!bill) {
        console.log('Bill not found in database');
        process.exit(0);
    }

    console.log('\n=== DATABASE RECORD ===');
    console.log('ID:', bill.id);
    console.log('Title:', bill.title);
    console.log('\nSummaries field:', bill.summaries);
    console.log('Has summaries:', !!bill.summaries);
    console.log('Summaries length:', bill.summaries?.length || 0);

    console.log('\nAbstracts field:', bill.abstracts);
    console.log('Has abstracts:', !!bill.abstracts);

    console.log('\nGemini Summary:', bill.geminiSummary);

    if (bill.summaries && bill.summaries.length > 0) {
        console.log('\n=== STORED SUMMARIES ===');
        bill.summaries.forEach((s: any, idx: number) => {
            console.log(`\nSummary ${idx}:`);
            console.log('Text (first 200 chars):', s.text?.substring(0, 200));
        });
    }

    process.exit(0);
}

checkDB().catch(console.error);
