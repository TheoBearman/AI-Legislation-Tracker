
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkRepresentatives() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Missing MONGODB_URI');

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'statepulse');
    const collection = db.collection('representatives');

    const total = await collection.countDocuments();
    console.log(`Total representatives: ${total}`);

    const usHouse = await collection.countDocuments({ jurisdiction: 'US House' });
    const usSenate = await collection.countDocuments({ jurisdiction: 'US Senate' });
    console.log(`US House: ${usHouse}`);
    console.log(`US Senate: ${usSenate}`);

    const stateReps = await collection.countDocuments({ jurisdiction: { $nin: ['US House', 'US Senate'] } });
    console.log(`State Representatives: ${stateReps}`);

    if (stateReps > 0) {
        const sampleStateRep = await collection.findOne({ jurisdiction: { $nin: ['US House', 'US Senate'] } });
        console.log('Sample State Rep Party:', sampleStateRep?.party);
        console.log('Sample State Rep Jurisdiction:', sampleStateRep?.jurisdiction);
    }

    if (usHouse > 0) {
        const sampleUSHouse = await collection.findOne({ jurisdiction: 'US House' });
        console.log('Sample US House Party:', sampleUSHouse?.party);
    }

    const unknownParty = await collection.countDocuments({ party: { $in: [null, 'Unknown', ''] } });
    console.log(`Reps with unknown party: ${unknownParty}`);

    await client.close();
}

checkRepresentatives().catch(console.error);
