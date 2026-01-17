
import { upsertLegislation, getLegislationById } from '@/services/legislationService';
import { classifyLegislationForFetch } from '@/services/classifyLegislationService';
import { fetchWhitehouseExecutiveOrders } from '@/services/whitehouseScraperService';
import { transformCongressBillToMongoDB } from './utils/transformCongressBillToMongoDB';
import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';

// Load env vars
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

const OPENSTATES_API_KEY = process.env.OPENSTATES_API_KEY;
const OPENSTATES_API_BASE_URL = 'https://v3.openstates.org';

// Congress API Keys (primary + backups) - automatically filters out undefined keys
const CONGRESS_API_KEYS = [
    process.env.US_CONGRESS_API_KEY,
    process.env.US_CONGRESS_API_KEY_BACKUP_1,
    process.env.US_CONGRESS_API_KEY_BACKUP_2,
].filter(Boolean) as string[];
console.log('ℹ️  Loaded ' + CONGRESS_API_KEYS.length + ' Congress API keys.');

const CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

// Key rotation state
let currentKeyIndex = 0;
let consecutiveRateLimits = 0;
const RATE_LIMIT_THRESHOLD = 2; // Switch keys after 2 consecutive 429s

function getCurrentCongressApiKey(): string {
    return CONGRESS_API_KEYS[currentKeyIndex] || '';
}

function rotateCongressApiKey(): void {
    if (currentKeyIndex < CONGRESS_API_KEYS.length - 1) {
        currentKeyIndex++;
        consecutiveRateLimits = 0; // Reset counter on rotation
        console.log(`🔄 Rotating to backup Congress API key #${currentKeyIndex + 1}`);
    } else {
        console.warn('⚠️  All Congress API keys exhausted. Continuing with last key.');
    }
}

const STATE_FILE = path.resolve(process.cwd(), 'data/daily_update_state.json');

// --- Congress Progress Tracking ---
interface CongressUpdateProgress {
    lastOffset: number;
    lastUpdated: string;
    processedCount: number;
    updatedCount: number;
    newAiCount: number;
}

const CONGRESS_PROGRESS_FILE = path.resolve(process.cwd(), 'data/congress-update-progress.json');

function loadCongressProgress(): CongressUpdateProgress {
    try {
        if (fs.existsSync(CONGRESS_PROGRESS_FILE)) {
            const data = fs.readFileSync(CONGRESS_PROGRESS_FILE, 'utf-8');
            const progress = JSON.parse(data);
            console.log(`📊 Resuming Congress updates from offset ${progress.lastOffset}`);
            return progress;
        }
    } catch (error) {
        console.log('No existing Congress progress file.');
    }
    return {
        lastOffset: 0,
        lastUpdated: new Date().toISOString(),
        processedCount: 0,
        updatedCount: 0,
        newAiCount: 0
    };
}

function saveCongressProgress(progress: CongressUpdateProgress): void {
    const dir = path.dirname(CONGRESS_PROGRESS_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONGRESS_PROGRESS_FILE, JSON.stringify(progress, null, 2));
    console.log(`💾 Congress progress saved at offset ${progress.lastOffset}`);
}

function clearCongressProgress(): void {
    if (fs.existsSync(CONGRESS_PROGRESS_FILE)) {
        fs.unlinkSync(CONGRESS_PROGRESS_FILE);
        console.log('✅ Congress progress file cleared (update complete).');
    }
}

// --- State Definitions ---
const STATE_OCD_IDS: { ocdId: string; abbr: string }[] = [
    { ocdId: 'ocd-jurisdiction/country:us/state:al/government', abbr: 'AL' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ak/government', abbr: 'AK' },
    { ocdId: 'ocd-jurisdiction/country:us/state:az/government', abbr: 'AZ' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ar/government', abbr: 'AR' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ca/government', abbr: 'CA' },
    { ocdId: 'ocd-jurisdiction/country:us/state:co/government', abbr: 'CO' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ct/government', abbr: 'CT' },
    { ocdId: 'ocd-jurisdiction/country:us/state:de/government', abbr: 'DE' },
    { ocdId: 'ocd-jurisdiction/country:us/state:fl/government', abbr: 'FL' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ga/government', abbr: 'GA' },
    { ocdId: 'ocd-jurisdiction/country:us/state:hi/government', abbr: 'HI' },
    { ocdId: 'ocd-jurisdiction/country:us/state:id/government', abbr: 'ID' },
    { ocdId: 'ocd-jurisdiction/country:us/state:il/government', abbr: 'IL' },
    { ocdId: 'ocd-jurisdiction/country:us/state:in/government', abbr: 'IN' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ia/government', abbr: 'IA' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ks/government', abbr: 'KS' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ky/government', abbr: 'KY' },
    { ocdId: 'ocd-jurisdiction/country:us/state:la/government', abbr: 'LA' },
    { ocdId: 'ocd-jurisdiction/country:us/state:me/government', abbr: 'ME' },
    { ocdId: 'ocd-jurisdiction/country:us/state:md/government', abbr: 'MD' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ma/government', abbr: 'MA' },
    { ocdId: 'ocd-jurisdiction/country:us/state:mi/government', abbr: 'MI' },
    { ocdId: 'ocd-jurisdiction/country:us/state:mn/government', abbr: 'MN' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ms/government', abbr: 'MS' },
    { ocdId: 'ocd-jurisdiction/country:us/state:mo/government', abbr: 'MO' },
    { ocdId: 'ocd-jurisdiction/country:us/state:mt/government', abbr: 'MT' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ne/government', abbr: 'NE' },
    { ocdId: 'ocd-jurisdiction/country:us/state:nv/government', abbr: 'NV' },
    { ocdId: 'ocd-jurisdiction/country:us/state:nh/government', abbr: 'NH' },
    { ocdId: 'ocd-jurisdiction/country:us/state:nj/government', abbr: 'NJ' },
    { ocdId: 'ocd-jurisdiction/country:us/state:nm/government', abbr: 'NM' },
    { ocdId: 'ocd-jurisdiction/country:us/state:nc/government', abbr: 'NC' },
    { ocdId: 'ocd-jurisdiction/country:us/state:nd/government', abbr: 'ND' },
    { ocdId: 'ocd-jurisdiction/country:us/state:oh/government', abbr: 'OH' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ok/government', abbr: 'OK' },
    { ocdId: 'ocd-jurisdiction/country:us/state:or/government', abbr: 'OR' },
    { ocdId: 'ocd-jurisdiction/country:us/state:pa/government', abbr: 'PA' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ri/government', abbr: 'RI' },
    { ocdId: 'ocd-jurisdiction/country:us/state:sc/government', abbr: 'SC' },
    { ocdId: 'ocd-jurisdiction/country:us/state:sd/government', abbr: 'SD' },
    { ocdId: 'ocd-jurisdiction/country:us/state:tn/government', abbr: 'TN' },
    { ocdId: 'ocd-jurisdiction/country:us/state:tx/government', abbr: 'TX' },
    { ocdId: 'ocd-jurisdiction/country:us/state:ut/government', abbr: 'UT' },
    { ocdId: 'ocd-jurisdiction/country:us/state:vt/government', abbr: 'VT' },
    { ocdId: 'ocd-jurisdiction/country:us/state:va/government', abbr: 'VA' },
    { ocdId: 'ocd-jurisdiction/country:us/state:wa/government', abbr: 'WA' },
    { ocdId: 'ocd-jurisdiction/country:us/state:wv/government', abbr: 'WV' },
    { ocdId: 'ocd-jurisdiction/country:us/state:wi/government', abbr: 'WI' },
    { ocdId: 'ocd-jurisdiction/country:us/state:wy/government', abbr: 'WY' }
];

interface UpdateState {
    lastRun: string;
}

function loadState(): UpdateState {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (error) {
        console.warn('Failed to load state file, using defaults.');
    }
    // Default to 2026-01-01 if no state file exists (first run)
    return { lastRun: '2026-01-01' };
}

function saveState(state: UpdateState) {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Failed to save state:', error);
    }
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function toMongoDate(dateInput: any): Date | null {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
}

// --- OpenStates Helpers ---
function displayOpenStatesId(id: string): string {
    if (id.startsWith('ocd-bill/')) {
        const rest = id.replace('ocd-bill/', '');
        const idx = rest.indexOf('-');
        if (idx !== -1) return 'ocd-bill_' + rest.slice(idx + 1);
        return 'ocd-bill_' + rest;
    }
    return id;
}

function transformOpenStatesBill(osBill: any, classificationData: any): any {
    const sponsors = (osBill.sponsorships || []).map((sp: any) => ({
        name: sp.name,
        id: sp.person?.id || sp.organization?.id || null,
        entityType: sp.person ? 'person' : (sp.organization ? 'organization' : null),
        primary: sp.primary || false,
        classification: sp.classification || null,
    }));

    const history = (osBill.actions || []).map((act: any) => ({
        date: toMongoDate(act.date),
        action: act.description,
        actor: act.organization?.name || null,
        classification: act.classification || [],
        order: act.order,
    })).filter((h: any) => h.date !== null);

    const versions = (osBill.versions || []).map((ver: any) => ({
        note: ver.note,
        date: toMongoDate(ver.date),
        links: ver.links || [],
    })).filter((v: any) => v.date !== null);

    const abstracts = (osBill.abstracts || []).map((a: any) => ({
        abstract: a.abstract,
        note: a.note || null,
    }));

    const summary = abstracts.length > 0 ? abstracts[0].abstract : null;

    return {
        id: displayOpenStatesId(osBill.id),
        identifier: osBill.identifier,
        title: osBill.title,
        session: osBill.session,
        jurisdictionId: osBill.jurisdiction?.id,
        jurisdictionName: osBill.jurisdiction?.name,
        classification: osBill.classification || [],
        subjects: classificationData?.subjects || osBill.subject || [],
        statusText: osBill.latest_action_description || null,
        sponsors,
        history,
        versions,
        abstracts,
        openstatesUrl: osBill.openstates_url,
        firstActionAt: toMongoDate(osBill.first_action_date),
        latestActionAt: toMongoDate(osBill.latest_action_date),
        latestActionDescription: osBill.latest_action_description,
        updatedAt: toMongoDate(osBill.updated_at),
        createdAt: toMongoDate(osBill.created_at),
        summary,
        topicClassification: classificationData?.topicClassification
    };
}

function transformOpenStatesVote(osVote: any): any {
    return {
        id: displayOpenStatesId(osVote.id),
        billId: displayOpenStatesId(osVote.bill_id),
        motion: osVote.motion_text,
        result: osVote.result,
        date: toMongoDate(osVote.start_date),
        counts: osVote.counts?.map((c: any) => ({ option: c.option, value: c.value })) || [],
        votes: osVote.votes?.map((v: any) => ({
            option: v.option,
            voterName: v.voter_name,
            voterId: v.voter_id ? displayOpenStatesId(v.voter_id) : null
        })) || []
    };
}

function transformOpenStatesPerson(person: any, jurisdictionName: string): any {
    const currentRole = person.roles?.find((r: any) => r.current && r.org_classification === 'legislature');
    const currentParty = person.party; // OpenStates v3 often puts party at top level or in roles

    // Fallback if party is array or in roles
    let partyName = typeof person.party === 'string' ? person.party : null;
    if (!partyName && person.current_role) {
        partyName = person.current_role.party;
    }

    return {
        id: displayOpenStatesId(person.id),
        name: person.name,
        givenName: person.given_name,
        familyName: person.family_name,
        image: person.image,
        party: partyName,
        state: jurisdictionName, // We pass this in from the loop context
        district: currentRole?.district,
        gender: person.gender,
        biography: person.biography,
        updatedAt: new Date(),
        // Store raw extra data just in case
        extras: person.extras
    };
}


// --- Congress Helpers ---
async function fetchWithRetry(url: string, retries = 3, backoff = 2000): Promise<any> {
    try {
        const response = await fetch(url);

        if (response.status === 429) {
            consecutiveRateLimits++;
            console.log(`⚠️  Rate limit hit (${consecutiveRateLimits}/${RATE_LIMIT_THRESHOLD + 3}). Waiting ${backoff}ms...`);

            // Rotate key if we hit threshold
            if (consecutiveRateLimits >= RATE_LIMIT_THRESHOLD && url.includes('api.congress.gov')) {
                rotateCongressApiKey();
                // Replace api_key in URL with new key
                const newKey = getCurrentCongressApiKey();
                url = url.replace(/api_key=[^&]+/, `api_key=${newKey}`);
            }

            await delay(backoff);
            return fetchWithRetry(url, retries - 1, backoff * 2);
        }

        // Success - reset rate limit counter
        consecutiveRateLimits = 0;
        return response;

    } catch (error) {
        if (retries === 0) throw error;
        await delay(backoff);
        return fetchWithRetry(url, retries - 1, backoff * 2);
    }
}

// --- Update Functions ---

async function updateStateBills(updatedSince: string) {
    if (!OPENSTATES_API_KEY) {
        console.error('OPENSTATES_API_KEY is missing. Skipping State updates.');
        return;
    }
    console.log(`\n--- Processing State Bills (Since ${updatedSince}) ---`);

    let totalUpdated = 0;
    let totalNewAi = 0;
    let totalSkippedStates = 0;
    const cutoffTime = new Date(updatedSince).getTime();

    for (const stateMeta of STATE_OCD_IDS) {
        let page = 1;
        let hasMore = true;
        let stateHadUpdates = false;

        while (hasMore) {
            const url = `${OPENSTATES_API_BASE_URL}/bills?jurisdiction=${stateMeta.ocdId}&updated_since=${updatedSince}&sort=updated_desc&page=${page}&per_page=20&apikey=${OPENSTATES_API_KEY}&include=abstracts&include=sponsorships&include=actions`;

            try {
                await delay(200);
                const response = await fetch(url);
                if (!response.ok) break;

                const data: any = await response.json();
                const bills = data.results || [];

                if (bills.length === 0) break;

                // Early exit optimization: check if oldest bill on this page is before cutoff
                let shouldContinue = false;

                for (const bill of bills) {
                    const billUpdatedAt = bill.updated_at ? new Date(bill.updated_at).getTime() : 0;

                    // If this bill is older than our cutoff, we can stop for this state
                    // (since results are sorted by updated_desc)
                    if (billUpdatedAt < cutoffTime) {
                        hasMore = false;
                        break;
                    }

                    shouldContinue = true;
                    const mongoId = displayOpenStatesId(bill.id);
                    const existing = await getLegislationById(mongoId);

                    // Use strict AI filter - only bills with explicit AI mentions
                    const title = bill.title || '';
                    const summary = bill.abstracts?.[0]?.abstract || '';
                    const abstracts = bill.abstracts || [];

                    const hasExplicitAI =
                        title.toLowerCase().includes('artificial intelligence') ||
                        /\bai\b/i.test(title) ||
                        summary.toLowerCase().includes('artificial intelligence') ||
                        /\bai\b/i.test(summary) ||
                        abstracts.some((a: any) =>
                            (a.abstract || '').toLowerCase().includes('artificial intelligence') ||
                            /\bai\b/i.test(a.abstract || '')
                        );

                    if (existing) {
                        // Update existing bill regardless of AI status (it's already in DB)
                        const classification = classifyLegislationForFetch({
                            title: bill.title,
                            summary: bill.abstracts?.[0]?.abstract,
                            abstracts: bill.abstracts
                        });
                        const transformed = transformOpenStatesBill(bill, classification || existing);
                        transformed.geminiSummary = existing.geminiSummary;
                        await upsertLegislation(transformed);
                        totalUpdated++;
                        stateHadUpdates = true;
                    } else if (hasExplicitAI) {
                        // Only insert new bills if they explicitly mention AI
                        const classification = classifyLegislationForFetch({
                            title: bill.title,
                            summary: bill.abstracts?.[0]?.abstract,
                            abstracts: bill.abstracts
                        });
                        const transformed = transformOpenStatesBill(bill, classification);
                        transformed.geminiSummary = null;
                        await upsertLegislation(transformed);
                        console.log(`  [NEW AI] ${stateMeta.abbr} ${bill.identifier}: ${bill.title.substring(0, 50)}...`);
                        totalNewAi++;
                        stateHadUpdates = true;
                    }
                }

                // If we didn't process any bills on this page, we can stop
                if (!shouldContinue) {
                    hasMore = false;
                    break;
                }

                if (data.pagination && data.pagination.page < data.pagination.max_page) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (err) {
                console.error(`Error processing ${stateMeta.abbr}:`, err);
                hasMore = false;
            }
        }

        if (!stateHadUpdates) {
            totalSkippedStates++;
        }
    }
    console.log(`State Bills Update Complete: ${totalUpdated} updated, ${totalNewAi} new AI bills.`);
    console.log(`States with no updates: ${totalSkippedStates}/${STATE_OCD_IDS.length}`);
}


async function updateStateVotes(updatedSince: string) {
    if (!OPENSTATES_API_KEY) return;
    console.log(`\n--- Processing State Votes (Since ${updatedSince}) ---`);

    const billsCollection = await getCollection('legislation');
    const votesCollection = await getCollection('votes');

    // Cache AI Bill IDs for quick lookup (optimize if too large, but for ~1-2k bills it's fine)
    const aiBills = await billsCollection.find({}, { projection: { id: 1 } }).toArray();
    const aiBillIdSet = new Set(aiBills.map((b: any) => b.id));

    let totalVotes = 0;

    for (const stateMeta of STATE_OCD_IDS) {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            // Vote endpoint support updated_since? Yes usually.
            const url = `${OPENSTATES_API_BASE_URL}/votes?jurisdiction=${stateMeta.ocdId}&updated_since=${updatedSince}&sort=updated_desc&page=${page}&per_page=20&apikey=${OPENSTATES_API_KEY}`;

            try {
                await delay(200);
                const response = await fetch(url);
                if (!response.ok) break;

                const data: any = await response.json();
                const votes = data.results || [];

                if (votes.length === 0) break;

                for (const vote of votes) {
                    const mongoBillId = displayOpenStatesId(vote.bill_id);

                    // Only import votes for bills we track
                    if (aiBillIdSet.has(mongoBillId)) {
                        const transformed = transformOpenStatesVote(vote);
                        await votesCollection.updateOne(
                            { id: transformed.id },
                            { $set: transformed },
                            { upsert: true }
                        );
                        // console.log(`  Vote updated for ${vote.bill_identifier}`);
                        totalVotes++;
                    }
                }

                if (data.pagination && data.pagination.page < data.pagination.max_page) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (err) {
                // console.error(`Error fetching votes for ${stateMeta.abbr}`, err);
                hasMore = false;
            }
        }
    }
    console.log(`State Votes Update Complete: ${totalVotes} votes processed.`);
}

async function updateStateLegislators(updatedSince: string) {
    if (!OPENSTATES_API_KEY) return;
    console.log(`\n--- Processing State Legislators (Since ${updatedSince}) ---`);

    const legislatorsCollection = await getCollection('legislators');
    let totalLegislators = 0;

    for (const stateMeta of STATE_OCD_IDS) {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const url = `${OPENSTATES_API_BASE_URL}/people?jurisdiction=${stateMeta.ocdId}&updated_since=${updatedSince}&sort=updated_desc&page=${page}&per_page=20&apikey=${OPENSTATES_API_KEY}`;

            try {
                await delay(200);
                const response = await fetch(url);
                if (!response.ok) break;

                const data: any = await response.json();
                const people = data.results || [];

                if (people.length === 0) break;

                for (const person of people) {
                    const transformed = transformOpenStatesPerson(person, stateMeta.abbr);
                    await legislatorsCollection.updateOne(
                        { id: transformed.id },
                        { $set: transformed },
                        { upsert: true }
                    );
                    totalLegislators++;
                }

                if (data.pagination && data.pagination.page < data.pagination.max_page) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (err) {
                // console.error(`Error fetching people for ${stateMeta.abbr}`, err);
                hasMore = false;
            }
        }
    }
    console.log(`Legislators Update Complete: ${totalLegislators} processed.`);
}


async function updateExecutiveOrders(updatedSince: string) {
    console.log(`\n--- Processing Executive Orders ---`);
    // Convert string date to Date object
    const cutoffDate = new Date(updatedSince);
    // Add a buffer to be safe (e.g. 7 days before last run)
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    await fetchWhitehouseExecutiveOrders(cutoffDate, 5); // strict page limit for daily updates
}

async function updateCongressBills(updatedSince: string) {
    if (CONGRESS_API_KEYS.length === 0) {
        console.error('No Congress API keys available. Skipping Congress updates.');
        return;
    }
    console.log(`\n--- Processing Congress Bills (Recent Actions) ---`);

    // We'll target the current congress (119) and check recent bills
    const CURRENT_CONGRESS = 119;

    // Using simple offset strategy since we can't filter by date easily on /bill/{congress}
    // We'll fetch the first few batches (most recent) and stop when updateDate < updatedSince

    const cutoffTime = new Date(updatedSince).getTime();

    // Load progress
    const progress = loadCongressProgress();
    let offset = progress.lastOffset || 0;
    let processedCount = progress.processedCount || 0;
    let updatedCount = progress.updatedCount || 0;
    let newAiCount = progress.newAiCount || 0;

    let limit = 20;
    let shouldContinue = true;

    while (shouldContinue && offset < 500) { // Safety cap of 500 recent bills
        const url = `${CONGRESS_API_BASE_URL}/bill/${CURRENT_CONGRESS}?api_key=${getCurrentCongressApiKey()}&format=json&offset=${offset}&limit=${limit}&sort=updateDate+desc`;

        try {
            const response = await fetchWithRetry(url);
            if (!response.ok) break;

            const data: any = await response.json();
            if (!data.bills || data.bills.length === 0) break;

            for (const bill of data.bills) {
                const updateDate = bill.updateDate ? new Date(bill.updateDate).getTime() : 0;

                // If bill hasn't been updated since our last run, we might be able to stop...
                // BUT Congress API sorting is tricky. Safe to process a fixed window.
                // However, strictly optimization:
                if (updateDate < cutoffTime) {
                    // We reached bills older than our last run. 
                    // NOTE: If sort isn't supported properly, this is risky. 
                    // Assuming default sort is roughly chronological or we just process the top N.
                }

                const billId = `congress-bill-${CURRENT_CONGRESS}-${bill.type.toLowerCase()}-${bill.number}`;
                const existing = await getLegislationById(billId);

                // Fetch full details
                const detailUrl = `${CONGRESS_API_BASE_URL}/bill/${CURRENT_CONGRESS}/${bill.type.toLowerCase()}/${bill.number}?api_key=${getCurrentCongressApiKey()}&format=json`;
                const detailResponse = await fetchWithRetry(detailUrl);
                if (!detailResponse.ok) continue;

                const detailData: any = await detailResponse.json();
                const congressBill = detailData.bill;

                // Strict AI Check - only bills with explicit AI mentions
                const title = congressBill.title || '';
                const summary = congressBill.summaries?.[0]?.text || '';

                const hasExplicitAI =
                    title.toLowerCase().includes('artificial intelligence') ||
                    /\bai\b/i.test(title) ||
                    summary.toLowerCase().includes('artificial intelligence') ||
                    /\bai\b/i.test(summary);

                if (existing) {
                    // Update existing bill (always, to capture status changes)
                    const actionsRes = await fetchWithRetry(`${CONGRESS_API_BASE_URL}/bill/${CURRENT_CONGRESS}/${bill.type.toLowerCase()}/${bill.number}/actions?api_key=${getCurrentCongressApiKey()}&format=json`);
                    if (actionsRes.ok) congressBill.actions = await actionsRes.json();

                    const transformed = transformCongressBillToMongoDB(congressBill);
                    // Preserve existing AI summary
                    transformed.geminiSummary = existing.geminiSummary;

                    await upsertLegislation(transformed);
                    processedCount++;
                    updatedCount++;
                } else if (hasExplicitAI) {
                    // New AI Bill - only insert if it explicitly mentions AI
                    const actionsRes = await fetchWithRetry(`${CONGRESS_API_BASE_URL}/bill/${CURRENT_CONGRESS}/${bill.type.toLowerCase()}/${bill.number}/actions?api_key=${getCurrentCongressApiKey()}&format=json`);
                    if (actionsRes.ok) congressBill.actions = await actionsRes.json();

                    const transformed = transformCongressBillToMongoDB(congressBill);
                    transformed.geminiSummary = null;

                    await upsertLegislation(transformed);
                    console.log(`  [NEW AI] US Congress ${bill.type}${bill.number}: ${bill.title.substring(0, 50)}...`);
                    processedCount++;
                    newAiCount++;
                }
            }

            offset += limit;

            // Save progress after each page
            progress.lastOffset = offset;
            progress.processedCount = processedCount;
            progress.updatedCount = updatedCount;
            progress.newAiCount = newAiCount;
            progress.lastUpdated = new Date().toISOString();
            saveCongressProgress(progress);

            await delay(500);
        } catch (err) {
            console.error('Error fetching Congress bills:', err);
            // Progress already saved, can resume next time
            throw err; // Let resilient wrapper handle it
        }
    }
    // Completed successfully - clear progress
    clearCongressProgress();
    console.log(`\nCongress Update Complete: ${processedCount} bills processed, ${updatedCount} updated, ${newAiCount} new AI bills.`);
}

// --- Main Runner ---

async function runDailyUpdate() {
    const state = loadState();
    const updatedSince = state.lastRun;
    const today = new Date().toISOString().split('T')[0];

    console.log(`\n=== DAILY DATA UPDATE ===`);
    console.log(`Baseline: ${updatedSince}`);

    const errors: string[] = [];

    // Executive Orders - independent execution
    try {
        await updateExecutiveOrders(updatedSince);
        console.log('✅ Executive Orders update completed');
    } catch (error: any) {
        console.error('❌ Executive Orders update failed:', error.message);
        errors.push('Executive Orders');
    }

    // Congress Bills - independent execution with progress tracking
    try {
        await updateCongressBills(updatedSince);
        console.log('✅ Congress Bills update completed');
    } catch (error: any) {
        console.error('❌ Congress Bills update failed:', error.message);
        errors.push('Congress Bills');
    }

    // State Votes - independent execution
    try {
        await updateStateVotes(updatedSince);
        console.log('✅ State Votes update completed');
    } catch (error: any) {
        console.error('❌ State Votes update failed:', error.message);
        errors.push('State Votes');
    }

    // State Legislators - independent execution
    try {
        await updateStateLegislators(updatedSince);
        console.log('✅ State Legislators update completed');
    } catch (error: any) {
        console.error('❌ State Legislators update failed:', error.message);
        errors.push('State Legislators');
    }

    // Report summary
    if (errors.length > 0) {
        console.warn(`\n⚠️  Some updates failed: ${errors.join(', ')}`); 
        console.warn('Continuing workflow - successful updates have been saved\n');
    }

    saveState({ lastRun: today });
    console.log(`\n=== Daily Update Complete ===`);
    console.log(`Successful: ${4 - errors.length}/4 update sections`);
    
    // Exit with 0 even if some updates failed - timestamp should always update
    process.exit(0);
}

runDailyUpdate().catch(console.error);
