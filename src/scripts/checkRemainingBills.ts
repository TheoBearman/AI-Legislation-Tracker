import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';
import path from 'path';

// Load env vars
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

async function checkRemainingBills() {
    console.log('\n=== Checking Remaining Bills ===\n');

    const collection = await getCollection('legislation');

    // Count by jurisdiction type
    const federalCount = await collection.countDocuments({
        $or: [
            { jurisdictionName: 'United States' },
            { jurisdictionName: 'United States Congress' },
            { jurisdictionId: { $regex: /^ocd-jurisdiction\/country:us\/government$/ } }
        ]
    });

    const stateCount = await collection.countDocuments({
        jurisdictionName: { $nin: ['United States', 'United States Congress'] }
    });

    const totalCount = await collection.countDocuments({});

    console.log('Current Database Status:');
    console.log(`  Total bills: ${totalCount}`);
    console.log(`  Federal bills: ${federalCount}`);
    console.log(`  State bills: ${stateCount}`);
    console.log('');

    // Get sample federal bills
    if (federalCount > 0) {
        console.log('Sample Federal Bills (first 10):');
        const federalSamples = await collection.find({
            $or: [
                { jurisdictionName: 'United States' },
                { jurisdictionName: 'United States Congress' }
            ]
        }).limit(10).toArray();

        for (const bill of federalSamples) {
            console.log(`  - ${bill.identifier}: ${bill.title?.substring(0, 80)}...`);
        }
        console.log('');
    }

    // Get sample state bills
    if (stateCount > 0) {
        console.log('Sample State Bills (first 10):');
        const stateSamples = await collection.find({
            jurisdictionName: { $nin: ['United States', 'United States Congress'] }
        }).limit(10).toArray();

        for (const bill of stateSamples) {
            console.log(`  - ${bill.jurisdictionName} ${bill.identifier}: ${bill.title?.substring(0, 60)}...`);
        }
        console.log('');
    }

    // Count by state
    const byJurisdiction = await collection.aggregate([
        {
            $group: {
                _id: '$jurisdictionName',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]).toArray();

    console.log('Bills by Jurisdiction:');
    for (const item of byJurisdiction) {
        console.log(`  ${item._id}: ${item.count}`);
    }

    process.exit(0);
}

checkRemainingBills().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
