import { config } from 'dotenv';
config({ path: '.env.local' });
import { MongoClient } from 'mongodb';

async function main() {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;

    console.log('Testing MongoDB Connection...');
    console.log(`URI defined: ${!!uri}`);
    console.log(`DB Name: ${dbName}`);

    if (!uri) {
        console.error('No MONGODB_URI found.');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('Successfully connected to MongoDB.');

        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

        const legislationCount = await db.collection('legislation').countDocuments();
        console.log(`Documents in 'legislation': ${legislationCount}`);

        const stateStatsCount = await db.collection('stateStats').countDocuments();
        console.log(`Documents in 'stateStats': ${stateStatsCount}`);

    } catch (error) {
        console.error('Connection failed:', error);
    } finally {
        await client.close();
    }
}

main();
