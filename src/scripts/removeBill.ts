import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function removeBill() {
    const billId = 'congress-bill-119-hr-1229';

    console.log(`Removing bill: ${billId}`);

    const legislationCollection = await getCollection('legislation');
    const result = await legislationCollection.deleteOne({ id: billId });

    if (result.deletedCount > 0) {
        console.log(`✓ Successfully removed ${billId}`);
    } else {
        console.log(`✗ Bill ${billId} not found in database`);
    }

    process.exit(0);
}

removeBill().catch((error) => {
    console.error('Error removing bill:', error);
    process.exit(1);
});
