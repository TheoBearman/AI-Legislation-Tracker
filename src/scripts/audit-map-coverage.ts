
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function auditReps() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Missing MONGODB_URI');

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'statepulse');
    const collection = db.collection('representatives');

    const cursor = collection.find({ jurisdiction: 'US House' });
    const reps = await cursor.toArray();

    let missing = 0;
    let total = reps.length;

    console.log(`Total US House Reps: ${total}`);

    for (const rep of reps) {
        if (!rep.map_boundary) {
            missing++;
            console.log(`[MISSING] ${rep.name} (${rep.state} - ${rep.district})`);
        }
    }

    console.log(`\nSummary: ${missing} out of ${total} reps have no map_boundary data.`);

    await client.close();
}

auditReps().catch(console.error);
