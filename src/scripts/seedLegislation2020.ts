
import { upsertLegislation } from '@/services/legislationService';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';

// Try to load .env.local first, then .env
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

const OPENSTATES_API_KEY = process.env.OPENSTATES_API_KEY;
const OPENSTATES_API_BASE_URL = 'https://v3.openstates.org';

// Configuration
const START_DATE = new Date('2020-01-01');

/**
 * Convert date strings or timestamp objects to JavaScript Date objects
 */
function toMongoDate(
    dateInput: Date | { seconds: number; nanoseconds: number } | string | null | undefined
): Date | null {
    if (dateInput === null || typeof dateInput === 'undefined' || dateInput === '') {
        return null;
    }

    if (dateInput instanceof Date) {
        return isNaN(dateInput.getTime()) ? null : dateInput;
    }

    if (typeof dateInput === 'object' && 'seconds' in dateInput && 'nanoseconds' in dateInput) {
        // Convert Firebase Timestamp format to Date
        return new Date(dateInput.seconds * 1000);
    }

    // Handle string dates
    if (typeof dateInput === 'string') {
        const date = new Date(dateInput.split(' ')[0]);
        return isNaN(date.getTime()) ? null : date;
    }

    return null;
}

// Utility to convert OpenStates IDs to display format
function displayOpenStatesId(id: string): string {
    // Replace the first dash with an underscore, and remove 'ocd-bill/' prefix
    if (id.startsWith('ocd-bill/')) {
        const rest = id.replace('ocd-bill/', '');
        const idx = rest.indexOf('-');
        if (idx !== -1) {
            return 'ocd-bill_' + rest.slice(idx + 1);
        }
        return 'ocd-bill_' + rest;
    }
    return id;
}

/**
 * Transforms an OpenStates bill to a MongoDB-compatible document
 */
function transformOpenStatesBillToMongoDB(osBill: any): any {
    // Process sponsors
    const sponsors = (osBill.sponsorships || []).map((sp: any) => {
        let sponsorId: string | null = null;
        let entityType: string | null = sp.entity_type || null;
        let personId: string | null = null;
        let organizationId: string | null = null;

        if (sp.person) {
            sponsorId = sp.person.id;
            personId = sp.person.id;
            if (!entityType) entityType = 'person';
        } else if (sp.organization) {
            sponsorId = sp.organization.id;
            organizationId = sp.organization.id;
            if (!entityType) entityType = 'organization';
        }

        return {
            name: sp.name,
            id: sponsorId,
            entityType: entityType,
            primary: sp.primary || false,
            classification: sp.classification || null,
            personId: personId,
            organizationId: organizationId,
        };
    });

    // Process bill action history
    const history = (osBill.actions || [])
        .map((act: any) => {
            const eventDate = toMongoDate(act.date);
            if (!eventDate) return null;
            return {
                date: eventDate,
                action: act.description,
                actor: act.organization.name,
                classification: Array.isArray(act.classification) ? act.classification : [],
                order: act.order,
            };
        })
        .filter((h: any): h is NonNullable<typeof h> => h !== null);

    // Process bill versions
    const versions = (osBill.versions || [])
        .map((ver: any) => {
            const versionDate = toMongoDate(ver.date);
            if (!versionDate) return null;
            return {
                note: ver.note,
                date: versionDate,
                classification: ver.classification || null,
                links: (ver.links || []).map((l: any) => ({
                    url: l.url,
                    media_type: l.media_type || null,
                })),
            };
        })
        .filter((v: any): v is NonNullable<typeof v> => v !== null);

    // Process sources
    const sources = (osBill.sources || []).map((s: any) => ({
        url: s.url,
        note: s.note || null,
    }));

    // Process abstracts
    const abstracts = (osBill.abstracts || []).map((a: any) => ({
        abstract: a.abstract,
        note: a.note || null,
    }));

    // Get summary from first abstract if available
    const summary = abstracts.length > 0 ? abstracts[0].abstract : null;

    // Process extras
    let processedExtras: Record<string, any> | null = null;
    if (osBill.extras && Object.keys(osBill.extras).length > 0) {
        try {
            processedExtras = JSON.parse(JSON.stringify(osBill.extras));
        } catch (e) {
            console.warn(`Could not process extras for bill ${osBill.id}: ${e}`);
            processedExtras = null;
        }
    }

    const now = new Date();

    return {
        id: displayOpenStatesId(osBill.id),
        identifier: osBill.identifier,
        title: osBill.title,
        session: osBill.session,
        jurisdictionId: osBill.jurisdiction.id,
        jurisdictionName: osBill.jurisdiction.name,
        chamber:
            osBill.from_organization?.classification ||
            osBill.jurisdiction?.classification ||
            null,
        classification: Array.isArray(osBill.classification) ? osBill.classification : [],
        subjects: Array.isArray(osBill.subject) ? osBill.subject : [],
        statusText: osBill.latest_action_description || null,
        sponsors,
        history,
        versions: versions || [],
        sources: sources || [],
        abstracts: abstracts || [],
        openstatesUrl: osBill.openstates_url,
        firstActionAt: toMongoDate(osBill.first_action_date),
        latestActionAt: toMongoDate(osBill.latest_action_date),
        latestActionDescription: osBill.latest_action_description || null,
        latestPassageAt: toMongoDate(osBill.latest_passage_date),
        createdAt: toMongoDate(osBill.created_at) || now,
        updatedAt: toMongoDate(osBill.updated_at) || now,
        summary: summary,
        extras: processedExtras,
    };
}
const SKIP_AI_SUMMARIES = true;

// Re-using the state list from historical fetcher
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

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Rate limiter to avoid hitting OpenStates API limits
class RateLimiter {
    private lastRequestTime = 0;
    private minDelay = 1000; // 1 second between requests (OpenStates allows ~1000/hour = ~1/3.6s)
    private backoffMultiplier = 1;

    async waitForSlot(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const requiredDelay = this.minDelay * this.backoffMultiplier;

        if (timeSinceLastRequest < requiredDelay) {
            await delay(requiredDelay - timeSinceLastRequest);
        }
        this.lastRequestTime = Date.now();
    }

    onSuccess(): void {
        // Gradually reduce backoff on success
        this.backoffMultiplier = Math.max(1, this.backoffMultiplier * 0.9);
    }

    onRateLimit(): void {
        // Increase backoff on rate limit
        this.backoffMultiplier = Math.min(10, this.backoffMultiplier * 2);
        console.log(`Rate limit hit, increasing delay to ${this.minDelay * this.backoffMultiplier}ms`);
    }
}

const rateLimiter = new RateLimiter();

// Reuse interface from historical fetcher
interface OpenStatesApiBillListResponse {
    results?: any[];
    pagination?: {
        page: number;
        max_page: number;
        per_page: number;
        total_items: number;
    };
}

async function fetchSessionsForJurisdiction(ocdId: string): Promise<any[]> {
    const url = `${OPENSTATES_API_BASE_URL}/jurisdictions/${ocdId}?apikey=${OPENSTATES_API_KEY}&include=legislative_sessions`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Error fetching sessions for ${ocdId}: ${response.status}`);
            return [];
        }
        const data = (await response.json()) as { legislative_sessions?: any[] };
        return data.legislative_sessions || [];
    } catch (error) {
        console.error(`Exception fetching sessions for ${ocdId}:`, error);
        return [];
    }
}

async function fetchAndStoreBillsForSessionPage(
    ocdId: string,
    jurisdictionAbbr: string,
    sessionIdentifier: string,
    sessionName: string,
    page: number,
    perPage: number
): Promise<OpenStatesApiBillListResponse['pagination'] | null> {
    const includes = ['sponsorships', 'abstracts', 'versions', 'actions', 'sources'];
    const includeParams = includes.map(inc => `include=${inc}`).join('&');

    // Removed the q= search parameter as it's not supported by all states
    // We'll rely on client-side filtering instead
    const url = `${OPENSTATES_API_BASE_URL}/bills?jurisdiction=${ocdId}&session=${sessionIdentifier}&page=${page}&per_page=${perPage}&apikey=${OPENSTATES_API_KEY}&${includeParams}&sort=updated_desc`;

    console.log(`Fetching ${jurisdictionAbbr} - Session: ${sessionIdentifier} - Page ${page}`);

    try {
        // Wait for rate limiter before making request
        await rateLimiter.waitForSlot();

        const response = await fetch(url);
        if (response.status === 429) {
            rateLimiter.onRateLimit();
            console.log('Rate limit hit (429). Waiting 60s with backoff...');
            await delay(60000);
            return await fetchAndStoreBillsForSessionPage(ocdId, jurisdictionAbbr, sessionIdentifier, sessionName, page, perPage);
        }

        rateLimiter.onSuccess();

        if (!response.ok) {
            if (response.status === 404) {
                // Some sessions might not have matches
                return null;
            }
            console.error(`Error fetching bills: ${response.status}`);
            return null;
        }

        const billData = (await response.json()) as OpenStatesApiBillListResponse;
        const bills = billData.results || [];

        if (bills.length === 0) return billData.pagination;

        // Process bills in parallel batches of 10
        const BATCH_SIZE = 10;
        for (let i = 0; i < bills.length; i += BATCH_SIZE) {
            const batch = bills.slice(i, i + BATCH_SIZE);

            await Promise.allSettled(batch.map(async (osBill: any) => {
                try {
                    const legislationToStore = transformOpenStatesBillToMongoDB(osBill);

                    // --- CLIENT-SIDE FILTERING (Double Check) ---
                    const aiRegex = /artificial intelligence|generative ai|automated decision|algorithm/i;
                    let hasAiContent = false;

                    if (legislationToStore.title && aiRegex.test(legislationToStore.title)) {
                        hasAiContent = true;
                    }

                    if (!hasAiContent && legislationToStore.abstracts && legislationToStore.abstracts.length > 0) {
                        for (const abs of legislationToStore.abstracts) {
                            if (abs.abstract && aiRegex.test(abs.abstract)) {
                                hasAiContent = true;
                                break;
                            }
                        }
                    }

                    // Also check summary if available (though usually null here)
                    if (!hasAiContent && legislationToStore.summary && aiRegex.test(legislationToStore.summary)) {
                        hasAiContent = true;
                    }

                    if (!hasAiContent) {
                        // Skip if no AI content found even after API filtering
                        // console.log(`Skipping non-AI bill: ${legislationToStore.identifier}`);
                        // continue;

                        // actually, enable this check to be safe
                        console.log(`Skipping non-AI bill (client check): ${legislationToStore.identifier}`);
                        return; // Use return instead of continue inside Promise callback
                    }

                    // --- CRITICAL OVERRIDE: NO AI SUMMARY GENERATION ---

                    // Just use the title if fullText is needed for something else, but we skip Gemini
                    const fullText = legislationToStore.title || '';
                    legislationToStore.fullText = fullText;
                    legislationToStore.geminiSummary = null; // Ensuring explicit null

                    await upsertLegislation(legislationToStore);
                } catch (error) {
                    console.error(`Error processing bill ${osBill.identifier}:`, error);
                }
            }));

            // Small delay between batches
            await delay(200);
        }

        await delay(500); // Respect rate limits between pages
        return billData.pagination;
    } catch (error) {
        console.error(`Exception fetching bills:`, error);
        return null;
    }
}

async function processState(state: { ocdId: string; abbr: string }) {
    console.log(`\n--- Processing State: ${state.abbr} ---`);

    const sessions = await fetchSessionsForJurisdiction(state.ocdId);

    // Filter sessions that overlap with our start date (post Jan 1, 2020)
    const recentSessions = sessions.filter(session => {
        // If no dates, assume it might be relevant? Or skip? 
        // Usually OpenStates has start_date.
        if (!session.start_date && !session.end_date) return false;

        const startDate = session.start_date ? new Date(session.start_date) : null;
        const endDate = session.end_date ? new Date(session.end_date) : null;

        // Check if session ends after 2020-01-01
        if (endDate && endDate >= START_DATE) return true;

        // Check if session started after 2020-01-01 (or is ongoing)
        if (startDate && startDate >= START_DATE) return true;

        // If it started before 2020 but ends after (or has no end date yet), keep it
        if (startDate && (!endDate || endDate >= START_DATE)) return true;

        return false;
    });

    console.log(`Found ${recentSessions.length} relevant sessions since 2020.`);

    for (const session of recentSessions) {
        console.log(`  Processing Session: ${session.name} (${session.identifier})`);

        let page = 1;
        const perPage = 50; // Increased from 20
        let hasMore = true;

        while (hasMore) {
            const pagination = await fetchAndStoreBillsForSessionPage(
                state.ocdId,
                state.abbr,
                session.identifier,
                session.name,
                page,
                perPage
            );

            if (pagination && pagination.page < pagination.max_page) {
                page++;
            } else {
                hasMore = false;
            }
        }
    }
}

async function main() {
    console.log('--- Starting Seeding Script (Since Jan 1, 2020) ---');
    console.log('--- NO AI SUMMARIES WILL BE GENERATED ---');

    // 1. Process States
    for (const state of STATE_OCD_IDS) {
        await processState(state);
    }

    console.log('\n--- State Legislation Seeding Complete ---');
    console.log('--- Please run "npm run fetch-congress-historical -- --start 116" to seed federal bills ---');
}

main().catch(console.error);
