import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'statepulse-data';

// Keywords to keep (matching the seeding logic)
const AI_KEYWORDS = [
    'artificial intelligence',
    'generative ai',
    'automated decision',
    'algorithm'
];

async function purgeNonAI() {
    console.log('Connecting to MongoDB...');
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection('legislation');

        console.log(`Connected to database: ${DB_NAME}`);

        const countBefore = await collection.countDocuments();
        console.log(`Total documents before purge: ${countBefore}`);

        // Construct query to find documents that generally DO NOT match the AI keywords
        // It's safer to identify the ones to KEEP and then delete the rest, 
        // or construct a delete query for those that don't match.

        // We want to delete where NONE of the fields contain ANY of the keywords.
        // So we delete if: NOT (title has keyword OR abstract has keyword OR summary has keyword)

        const statusRegex = new RegExp(AI_KEYWORDS.join('|'), 'i');

        // Let's iterate and check to be absolutely safe, rather than a complex mongo regex query that might miss edge cases
        // Or we can use a query. 

        // Query for documents to KEEP:
        const keepQuery = {
            $or: [
                { title: { $regex: statusRegex } },
                { summary: { $regex: statusRegex } },
                { 'abstracts.abstract': { $regex: statusRegex } },
                { subjects: { $regex: statusRegex } }
            ]
        };

        // We want to remove documents that are NOT in the keepQuery
        const deleteResult = await collection.deleteMany({
            $nor: [
                { title: { $regex: statusRegex } },
                { summary: { $regex: statusRegex } },
                { 'abstracts.abstract': { $regex: statusRegex } },
                { subjects: { $regex: statusRegex } }
            ]
        });

        console.log(`Purged ${deleteResult.deletedCount} documents that did not match AI keywords.`);

        const countAfter = await collection.countDocuments();
        console.log(`Total documents remaining: ${countAfter}`);

    } catch (error) {
        console.error('Error during purge:', error);
    } finally {
        await client.close();
    }
}

purgeNonAI()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
