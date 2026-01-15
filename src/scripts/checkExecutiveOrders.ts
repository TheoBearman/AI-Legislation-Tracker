import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';
import path from 'path';

// Load env vars
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

async function checkExecutiveOrders() {
    console.log('\n=== Checking Executive Orders ===\n');

    const collection = await getCollection('executive_orders');

    const allOrders = await collection.find({}).toArray();
    console.log(`Total Executive Orders: ${allOrders.length}\n`);

    if (allOrders.length > 0) {
        console.log('All Executive Orders:');
        for (const order of allOrders) {
            const title = order.title || 'No title';
            const hasAI =
                title.toLowerCase().includes('artificial intelligence') ||
                /\bai\b/i.test(title) ||
                (order.summary && order.summary.toLowerCase().includes('artificial intelligence')) ||
                (order.summary && /\bai\b/i.test(order.summary));

            const marker = hasAI ? '✅' : '❌';
            console.log(`${marker} ${order.number}: ${title.substring(0, 100)}`);
        }

        // Count non-AI orders
        const nonAIOrders = allOrders.filter(order => {
            const title = (order.title || '').toLowerCase();
            const summary = (order.summary || '').toLowerCase();

            const hasAI =
                title.includes('artificial intelligence') ||
                /\bai\b/i.test(order.title || '') ||
                summary.includes('artificial intelligence') ||
                /\bai\b/i.test(order.summary || '');

            return !hasAI;
        });

        console.log(`\n❌ Non-AI Executive Orders: ${nonAIOrders.length}`);
        console.log(`✅ AI-related Executive Orders: ${allOrders.length - nonAIOrders.length}`);
    }

    process.exit(0);
}

checkExecutiveOrders().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
