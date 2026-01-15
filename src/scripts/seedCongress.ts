
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fetch from 'node-fetch';

const CONGRESS_API_KEY = process.env.US_CONGRESS_API_KEY || '';
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB_NAME || 'statepulse';
const COLLECTION_NAME = 'representatives';

async function fetchCongressMembers(chamber: 'house' | 'senate') {
    let url = `https://api.congress.gov/v3/member/congress/119?api_key=${CONGRESS_API_KEY}`;
    let allMembers: any[] = [];

    console.log(`Fetching 119th Congress ${chamber} members...`);

    while (url) {
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Failed to fetch: ${res.status}`);
            break;
        }
        const data = await res.json() as any;
        const members = (data.members || []);
        allMembers = allMembers.concat(members);

        let nextUrl = data.pagination?.next || null;
        if (nextUrl) {
            if (nextUrl.startsWith('/')) nextUrl = `https://api.congress.gov${nextUrl}`;
            if (!nextUrl.includes('api_key=')) {
                const sep = nextUrl.includes('?') ? '&' : '?';
                nextUrl = `${nextUrl}${sep}api_key=${CONGRESS_API_KEY}`;
            }
        }
        url = nextUrl;
    }

    const chamberLabel = chamber === 'house' ? 'House of Representatives' : 'Senate';
    // Filter for members who have a term in the 119th Congress in the specified chamber
    return allMembers.filter((m: any) =>
        Array.isArray(m.terms?.item) && m.terms.item.some((term: any) => term.chamber === chamberLabel)
    ).map((m: any) => {
        // Basic normalization
        let lastTerm = m.terms.item.filter((term: any) => term.chamber === chamberLabel).slice(-1)[0];
        return {
            id: m.bioguideId || m.memberId,
            name: m.name,
            party: m.partyName || lastTerm?.partyName,
            state: m.state || lastTerm?.stateCode,
            district: m.district || lastTerm?.district,
            chamber: chamber === 'house' ? 'US House' : 'US Senate',
            jurisdiction: chamber === 'house' ? 'US House' : 'US Senate',
            image: m.depiction?.imageUrl,
            terms: m.terms,
            // Add other fields as needed matching the schema
        };
    });
}

async function main() {
    if (!CONGRESS_API_KEY) throw new Error('Missing US_CONGRESS_API_KEY');
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    for (const chamber of ['house', 'senate'] as const) {
        const reps = await fetchCongressMembers(chamber);
        if (reps.length > 0) {
            // Delete existing US House/Senate to avoid duplicates/stale data
            const jurisdiction = chamber === 'house' ? 'US House' : 'US Senate';
            await collection.deleteMany({ jurisdiction });
            await collection.insertMany(reps);
            console.log(`Stored ${reps.length} members for ${jurisdiction}`);
        }
    }
    await client.close();
}

main().catch(console.error);
