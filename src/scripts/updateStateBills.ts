
import { upsertLegislation, getLegislationById } from '@/services/legislationService';
import { getCollection } from '@/lib/mongodb';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';

// Load env vars
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

// OpenStates API Keys (primary + backups) - automatically filters out undefined keys
const OPENSTATES_API_KEYS = [
    process.env.OPENSTATES_API_KEY,
    process.env.OPENSTATES_API_KEY_BACKUP_1,
    process.env.OPENSTATES_API_KEY_BACKUP_2,
].filter(Boolean) as string[];

// Key rotation state
let currentKeyIndex = 0;

function getCurrentOpenStatesApiKey(): string {
    return OPENSTATES_API_KEYS[currentKeyIndex] || '';
}

function rotateOpenStatesApiKey(): void {
    if (currentKeyIndex < OPENSTATES_API_KEYS.length - 1) {
        currentKeyIndex++;
        console.log(`🔄 Rotating to backup OpenStates API key #${currentKeyIndex + 1}`);
    } else {
        console.warn('⚠️  All OpenStates API keys exhausted. Continuing with last key.');
    }
}

const OPENSTATES_API_BASE_URL = 'https://v3.openstates.org';
// OpenStates API wants YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS (no Z suffix)
const UPDATED_SINCE = (process.env.UPDATED_SINCE || '2026-01-01').replace(/Z$/, '');
const PROGRESS_FILE = path.resolve(process.cwd(), 'data/state-update-progress.json');

// Progress tracking
interface UpdateProgress {
    completedStates: string[];
    currentState?: string;  // State currently being processed
    currentPage?: number;   // Last successful page for current state
    lastUpdated: string;
}

function loadProgress(): UpdateProgress {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
            const progress = JSON.parse(data);
            // Log resume info if there's a state in progress
            if (progress.currentState && progress.currentPage) {
                console.log(`Resuming ${progress.currentState} from page ${progress.currentPage}`);
            }
            return progress;
        }
    } catch (error) {
        console.log('No existing progress file or error reading it.');
    }
    return { completedStates: [], lastUpdated: new Date().toISOString() };
}

function saveProgress(progress: UpdateProgress): void {
    const dir = path.dirname(PROGRESS_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function clearProgress(): void {
    if (fs.existsSync(PROGRESS_FILE)) {
        fs.unlinkSync(PROGRESS_FILE);
        console.log('Progress file cleared.');
    }
}

// Strict AI filter - only explicit mentions of AI
function hasExplicitAIMention(bill: any): boolean {
    const title = (bill.title || '').toLowerCase();
    const summary = (bill.summary || '').toLowerCase();
    const abstracts = bill.abstracts || [];
    const abstractText = abstracts.map((a: any) => (a.abstract || '')).join(' ').toLowerCase();

    return (
        title.includes('artificial intelligence') ||
        /\bai\b/i.test(bill.title || '') ||
        summary.includes('artificial intelligence') ||
        /\bai\b/i.test(bill.summary || '') ||
        abstractText.includes('artificial intelligence') ||
        /\bai\b/i.test(abstractText)
    );
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Utility to convert OpenStates IDs to display format
function displayOpenStatesId(id: string): string {
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

function toMongoDate(dateInput: any): Date | null {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
}

function transformOpenStatesBillToMongoDB(osBill: any): any {
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
        subjects: osBill.subject || [],
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
        summary
    };
}

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

async function updateStateBills() {
    if (OPENSTATES_API_KEYS.length === 0) {
        console.error('No OPENSTATES_API_KEY set');
        process.exit(0); // Exit gracefully - don't block workflow
    }

    console.log(`ℹ️  Loaded ${OPENSTATES_API_KEYS.length} OpenStates API keys.`);

    // Load progress
    const progress = loadProgress();

    // Parse args for --start-from=STATE or regular state list
    const args = process.argv.slice(2);
    const startFromArg = args.find(a => a.startsWith('--start-from='));
    const startFromState = startFromArg ? startFromArg.split('=')[1].toUpperCase().trim() : null;

    // Filter out flags from potential direct state args (e.g. "CA TX")
    const targetStates = args.filter(a => !a.startsWith('--'));

    let statesToProcess = STATE_OCD_IDS;

    if (startFromState && startFromState.length === 2) {
        // Mode 1: Start From specific state and continue to end
        const startIndex = STATE_OCD_IDS.findIndex(s => s.abbr === startFromState);
        if (startIndex !== -1) {
            console.log(`🚀 Override: Starting from ${startFromState} (skipping previous states)`);
            statesToProcess = STATE_OCD_IDS.slice(startIndex);
            // In override mode, we IGNORE the progress file's completedStates to ensure we actually process
        } else {
            console.warn(`⚠️  Start state '${startFromState}' not found. Defaulting to normal behavior.`);
        }
    } else if (targetStates.length > 0) {
        // Mode 2: Specific list of states
        statesToProcess = STATE_OCD_IDS.filter(s => targetStates.includes(s.abbr));
        console.log(`Target states: ${targetStates.join(', ')}`);
    } else {
        // Mode 3: Normal Resume (filter out completed)
        statesToProcess = statesToProcess.filter(s => !progress.completedStates.includes(s.abbr));
        if (progress.completedStates.length > 0) {
            console.log(`Resuming from previous run. Already completed: ${progress.completedStates.join(', ')}`);
        }
    }

    console.log(`\n=== Updating State Bills (Since ${UPDATED_SINCE}) ===`);

    let processedCount = 0;
    let updatedCount = 0;
    let newAiCount = 0;
    let skippedStates = 0;
    const cutoffTime = new Date(UPDATED_SINCE).getTime();

    // Process each state
    for (const state of statesToProcess) {
        console.log(`\nChecking updates for ${state.abbr}...`);

        // Check if we're resuming this specific state from a previous run
        let page = 1;
        if (progress.currentState === state.abbr && progress.currentPage) {
            page = progress.currentPage;
            console.log(`  Resuming from page ${page}`);
        }

        let hasMore = true;
        let stateHadUpdates = false;
        let consecutiveRateLimits = 0;

        while (hasMore) {
            console.log(`  Fetching page ${page} for ${state.abbr} (Key #${currentKeyIndex + 1})...`);
            const url = `${OPENSTATES_API_BASE_URL}/bills?jurisdiction=${state.ocdId}&updated_since=${UPDATED_SINCE}&sort=updated_desc&page=${page}&per_page=20&apikey=${getCurrentOpenStatesApiKey()}&include=abstracts&include=sponsorships&include=actions`;

            try {
                // Increased delay to reduce rate limit hits
                await delay(500); // Increased from 200ms to 500ms

                const response = await fetch(url);

                if (response.status === 429) {
                    consecutiveRateLimits++;
                    console.log(`⚠️  Rate limit hit (${consecutiveRateLimits}/5). Waiting 2 minutes...`);

                    // Save progress when we're stuck (>=2 consecutive hits)
                    if (consecutiveRateLimits >= 2) {
                        console.log('  💾 Saving progress due to consecutive rate limits...');
                        progress.lastUpdated = new Date().toISOString();
                        saveProgress(progress);
                    }

                    if (consecutiveRateLimits >= 2 && currentKeyIndex < OPENSTATES_API_KEYS.length - 1) {
                        rotateOpenStatesApiKey();
                        consecutiveRateLimits = 0;
                        await delay(5000); // Short delay after rotation
                        continue;
                    }

                    await delay(120000); // Wait 2 minutes

                    if (consecutiveRateLimits >= 5) {
                        console.warn('\n🛑 Persistent rate limit hit. Exiting gracefully to allow cooldown.');
                        console.log(`Progress saved up to: ${progress.completedStates.join(', ')}`);
                        process.exit(0); // Exit gracefully - allow other updates to run
                    }
                    continue; // Retry the same page
                }
                // Reset counter on success or other errors
                consecutiveRateLimits = 0;

                // Update progress with current state and page after successful fetch
                progress.currentState = state.abbr;
                progress.currentPage = page;
                progress.lastUpdated = new Date().toISOString();

                if (!response.ok) {
                    if (response.status === 404) {
                        break; // No more results/pages likely
                    }
                    console.error(`Error ${response.status}: ${await response.text()}`);
                    break;
                }

                const data: any = await response.json();
                const bills = data.results || [];

                if (bills.length === 0) {
                    hasMore = false;
                    break;
                }

                // EARLY EXIT OPTIMIZATION: Check if bills are older than cutoff
                let shouldContinue = false;
                let oldBillCount = 0;

                // Process bills
                for (const bill of bills) {
                    const billUpdatedAt = bill.updated_at ? new Date(bill.updated_at).getTime() : 0;

                    // If this bill is older than our cutoff, count it and skip
                    if (billUpdatedAt < cutoffTime) {
                        oldBillCount++;
                        continue;
                    }

                    shouldContinue = true;
                    const mongoId = displayOpenStatesId(bill.id);
                    const existing = await getLegislationById(mongoId);

                    if (existing) {
                        const transformed = transformOpenStatesBillToMongoDB(bill);
                        // Preserve summary
                        transformed.geminiSummary = existing.geminiSummary;

                        await upsertLegislation(transformed);
                        console.log(`[UPDATE] ${state.abbr}: ${bill.identifier} updated.`);
                        updatedCount++;
                        stateHadUpdates = true;
                    } else {
                        const isAi = hasExplicitAIMention(bill);
                        if (isAi) {
                            const transformed = transformOpenStatesBillToMongoDB(bill);
                            transformed.geminiSummary = null; // Ensuring explicit null
                            await upsertLegislation(transformed);
                            console.log(`[NEW] ${state.abbr}: ${bill.identifier} found (AI).`);
                            newAiCount++;
                            stateHadUpdates = true;
                        }
                    }
                }

                // If >75% of bills on this page are old, stop fetching more pages
                if (oldBillCount > bills.length * 0.75) {
                    console.log(`  ⏭️  ${oldBillCount}/${bills.length} bills older than ${UPDATED_SINCE}, stopping pagination for ${state.abbr}`);
                    hasMore = false;
                    break;
                }


                // If we didn't process any bills on this page, stop
                if (!shouldContinue) {
                    hasMore = false;
                    break;
                }

                processedCount += bills.length;

                if (data.pagination && data.pagination.page < data.pagination.max_page) {
                    page++;
                    // Save progress after successfully processing each page
                    progress.currentPage = page;
                    saveProgress(progress);
                } else {
                    hasMore = false;
                }
            } catch (err) {
                console.error(`Error processing ${state.abbr}:`, err);
                hasMore = false;
            }
        }

        if (!stateHadUpdates) {
            skippedStates++;
        }

        // Mark state as completed
        if (!progress.completedStates.includes(state.abbr)) {
            progress.completedStates.push(state.abbr);
            // Clear current state tracking since we completed this state
            delete progress.currentState;
            delete progress.currentPage;
            progress.lastUpdated = new Date().toISOString();
            saveProgress(progress);
        }
    }

    console.log(`\n=== Update Complete ===`);
    console.log(`Processed ${processedCount} updated bills from API.`);
    console.log(`Updated ${updatedCount} existing AI bills.`);
    console.log(`Found ${newAiCount} NEW AI bills.`);
    console.log(`States with no updates: ${skippedStates}/${statesToProcess.length}`);

    // Check if all states are done
    const allStates = STATE_OCD_IDS.map(s => s.abbr);
    const remainingStates = allStates.filter(s => !progress.completedStates.includes(s));

    if (remainingStates.length === 0) {
        console.log('\n✅ All states completed! Clearing progress file.');
        clearProgress();
    } else {
        console.log(`\n⏸️  Outstanding states (${remainingStates.length}): ${remainingStates.join(', ')}`);
        console.log(`Progress saved to: ${PROGRESS_FILE}`);
        console.log('Run the script again to continue with remaining states.');
    }

    process.exit(0);
}

// Removed - using hasExplicitAIMention instead

updateStateBills().catch(console.error);
