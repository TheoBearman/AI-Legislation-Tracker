
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkRepDistricts() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Missing MONGODB_URI');

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'statepulse');
    const collection = db.collection('representatives');

    const usHouseRep = await collection.findOne({
        jurisdiction: 'US House',
        district: { $exists: true }
    });

    if (usHouseRep) {
        console.log('--- US House Sample ---');
        console.log('Name:', usHouseRep.name);
        console.log('State:', usHouseRep.state);
        console.log('District:', usHouseRep.district, typeof usHouseRep.district);
        console.log('Map Boundary:', usHouseRep.map_boundary);
    } else {
        console.log('No US House reps found with district');
    }

    await client.close();
}

checkRepDistricts().catch(console.error);
