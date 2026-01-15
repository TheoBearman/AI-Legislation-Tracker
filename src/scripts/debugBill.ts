
import { getLegislationById } from '@/services/legislationService';
import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';

// Load env vars
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

const OPENSTATES_API_KEY = process.env.OPENSTATES_API_KEY;
const OPENSTATES_API_BASE_URL = 'https://v3.openstates.org';

const TARGET_STATE = 'California';
const TARGET_BILL = 'SB 53';
const AI_KEYWORDS = [
    'artificial intelligence',
    'generative ai',
    'automated decision',
    'machine learning',
    'algorithm',
    'facial recognition',
    'deepfake',
    'predictive policing'
];

async function debugBill() {
    console.log(`--- Debugging ${TARGET_STATE} ${TARGET_BILL} ---`);

    // 1. Check MongoDB
    const collection = await getCollection('legislation');
    // Regex for case-insensitive state match if needed, but 'California' is standard
    // Identifier might be 'SB 53' or 'SB53'
    const dbBill = await collection.findOne({
        jurisdictionName: TARGET_STATE,
        identifier: TARGET_BILL
    });

    if (dbBill) {
        console.log('✅ Found in MongoDB:');
        console.log(`- ID: ${dbBill.id}`);
        console.log(`- Title: ${dbBill.title}`);
        console.log(`- Status: ${dbBill.statusText}`);
        console.log(`- Classification: ${JSON.stringify(dbBill.classification)}`);
        console.log(`- AI Summary: ${dbBill.geminiSummary ? 'Yes' : 'No'}`);
        console.log(`- EnactedAt: ${dbBill.enactedAt}`);
        console.log(`- Latest Action: ${dbBill.latestActionAt}`);
        return;
    }

    console.log('❌ Not found in MongoDB.');

    // 2. Fetch from OpenStates API
    if (!OPENSTATES_API_KEY) {
        console.error('OPENSTATES_API_KEY missing.');
        return;
    }

    console.log(`\nFetching from OpenStates API...`);
    // CA OCD ID: ocd-jurisdiction/country:us/state:ca/government
    const CA_OCD_ID = 'ocd-jurisdiction/country:us/state:ca/government';
    // We need to search for it.
    // Try explicit session/identifier query if possible, or just search.
    // List bills with q=SB 53 might be fuzzy.
    // Better: Filter by jurisdiction and identifier (if API supports identifier filter, likely 'q' or just iterate).
    // API v3 docs: ?jurisdiction=...&q=SB 53

    const url = `${OPENSTATES_API_BASE_URL}/bills?jurisdiction=${CA_OCD_ID}&q="${TARGET_BILL}"&apikey=${OPENSTATES_API_KEY}&include=abstracts&include=versions`;

    const res = await fetch(url);
    if (!res.ok) {
        console.error('API Error:', res.status, await res.text());
        return;
    }

    const data: any = await res.json();
    const results = data.results || [];

    // Find exact match
    const apiBill = results.find((b: any) => b.identifier === TARGET_BILL && b.jurisdiction.name === TARGET_STATE);

    if (!apiBill) {
        console.log('❌ Not found in OpenStates API either. Is the identifier correct?');
        console.log('Found similar results:', results.map((r: any) => `${r.identifier}: ${r.title}`).join('\n'));
        return;
    }

    console.log('✅ Found in OpenStates API:');
    console.log(`- ID: ${apiBill.id}`);
    console.log(`- Title: ${apiBill.title}`);

    // 3. Analyze content
    const textFields = [
        apiBill.title,
        apiBill.abstracts?.map((a: any) => a.abstract).join(' '),
    ].join(' ').toLowerCase();

    console.log('\n--- Content Analysis ---');
    console.log(`Text to scan: "${textFields}"`);

    const matchedKeywords = AI_KEYWORDS.filter(kw => textFields.includes(kw));

    if (matchedKeywords.length > 0) {
        console.log(`✅ MATCHES AI KEYWORDS: ${matchedKeywords.join(', ')}`);
        console.log('Reason for missing: Likely missed by bulk import filter (maybe abstract missing in dump?) or date range?');
    } else {
        console.log('❌ DOES NOT MATCH AI KEYWORDS.');
        console.log('This is why it was skipped.');
    }

    process.exit(0);
}

debugBill().catch(console.error);
