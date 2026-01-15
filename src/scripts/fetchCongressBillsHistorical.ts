import { transformCongressBillToMongoDB } from './utils/transformCongressBillToMongoDB';
import { getLegislationById, upsertLegislation } from '@/services/legislationService';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import { getCollection } from '@/lib/mongodb';
import { enactedPatterns } from "@/types/legislation";
import fs from 'fs';
import path from 'path';

config({ path: '../../.env' });

const CONGRESS_API_KEY = process.env.US_CONGRESS_API_KEY;
const CONGRESS_API_BASE_URL = 'https://api.congress.gov/v3';

const HISTORICAL_CONGRESS_SESSIONS = [
  119, 118, 117, 116
];

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
    return new Date(dateInput.seconds * 1000);
  }

  if (typeof dateInput === 'string') {
    const date = new Date(dateInput.split(' ')[0]);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}


function detectEnactedDate(history: any[]): Date | null {
  if (!history || history.length === 0) return null;

  const sortedHistory = [...history].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  for (const action of sortedHistory) {
    const actionText = (action.action || '').trim();
    if (!actionText) continue;

    for (const pattern of enactedPatterns) {
      if (pattern.test(actionText)) {
        return action.date ? new Date(action.date) : null;
      }
    }
  }

  return null;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: any = {}, retries = 5, backoff = 2000): Promise<any> {
  try {
    const response = await fetch(url, options);
    if (!response.ok && response.status === 429) {
      throw new Error(`Rate limit exceeded: ${response.status}`);
    }
    return response;
  } catch (error: any) {
    if (retries === 0 || (error.message && error.message.includes('Rate limit'))) {
      throw error;
    }
    const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.type === 'system';
    if (isNetworkError || (error.name === 'FetchError')) {
      console.warn(`\nNetwork error (${error.code || error.message}). Retrying in ${backoff}ms... (${retries} attempts left)`);
      await delay(backoff);
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

// Progress tracking
const PROGRESS_FILE = path.resolve(process.cwd(), 'data/congress-scraper-progress.json');

interface ScraperProgress {
  currentCongress: number;
  currentOffset: number;
  lastUpdated: string;
  completedCongresses: number[];
}

function loadProgress(): ScraperProgress | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading progress:', err);
  }
  return null;
}

function saveProgress(congress: number, offset: number, completedCongresses: number[] = []): void {
  try {
    const dir = path.dirname(PROGRESS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const progress: ScraperProgress = {
      currentCongress: congress,
      currentOffset: offset,
      lastUpdated: new Date().toISOString(),
      completedCongresses
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (err) {
    console.error('Error saving progress:', err);
  }
}

function clearProgress(): void {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
    }
  } catch (err) {
    console.error('Error clearing progress:', err);
  }
}

// Selective update function that only updates sponsors and history
async function updateBillSponsorsAndHistory(billId: string, sponsors: any[], history: any[], enactedAt: Date | null): Promise<void> {
  try {
    const legislationCollection = await getCollection('legislation');

    const updateFields: any = {
      sponsors,
      history,
      enactedAt,
      updatedAt: new Date()
    };

    if (history.length > 0) {
      const lastActionAt = history.reduce((latest: any, action: any) => {
        return action.date > latest ? action.date : latest;
      }, history[0].date);

      const firstActionAt = history.reduce((earliest: any, action: any) => {
        return action.date < earliest ? action.date : earliest;
      }, history[0].date);

      updateFields.latestActionAt = lastActionAt;
      updateFields.firstActionAt = firstActionAt;

      const sortedHistory = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (sortedHistory.length > 0) {
        updateFields.latestActionDescription = sortedHistory[0].action;
        updateFields.statusText = sortedHistory[0].action;
      }
    }

    await legislationCollection.updateOne(
      { id: billId },
      { $set: updateFields }
    );

    console.log(`Updated sponsors and history for existing bill: ${billId}`);
  } catch (error) {
    console.error(`Error updating sponsors and history for bill ${billId}:`, error);
    throw error;
  }
}

function processCongressSponsors(congressBill: any): any[] {
  const sponsors: Array<{
    name: string;
    id: string | null;
    entityType: string;
    primary: boolean;
    classification: string;
    personId: string | null;
    organizationId: string | null;
  }> = [];

  if (congressBill.sponsors && congressBill.sponsors.length > 0) {
    congressBill.sponsors.forEach((sponsor: any) => {
      sponsors.push({
        name: sponsor.fullName || `${sponsor.firstName || ''} ${sponsor.lastName || ''}`.trim(),
        id: sponsor.bioguideId || null,
        entityType: 'person',
        primary: true,
        classification: 'sponsor',
        personId: sponsor.bioguideId || null,
        organizationId: null,
      });
    });
  }

  if (congressBill.cosponsors && congressBill.cosponsors.length > 0) {
    congressBill.cosponsors.forEach((cosponsor: any) => {
      sponsors.push({
        name: cosponsor.fullName || `${cosponsor.firstName || ''} ${cosponsor.lastName || ''}`.trim(),
        id: cosponsor.bioguideId || null,
        entityType: 'person',
        primary: false,
        classification: 'cosponsor',
        personId: cosponsor.bioguideId || null,
        organizationId: null,
      });
    });
  }

  return sponsors;
}

function processCongressHistory(congressBill: any): any[] {
  return (congressBill.actions?.actions || [])
    .map((action: any) => {
      const eventDate = toMongoDate(action.actionDate);
      if (!eventDate) return null;
      return {
        date: eventDate,
        action: action.text,
        actor: action.sourceSystem?.name || 'Congress',
        classification: action.type ? [action.type] : [],
        order: action.actionCode || 0,
      };
    })
    .filter((h: any): h is NonNullable<typeof h> => h !== null);
}

/**
 * Fetch historical bills from a specific Congress session
 */
async function fetchHistoricalCongressBills(congressNumber: number, startOffset: number = 0, completedCongresses: number[] = []): Promise<boolean> {
  if (!CONGRESS_API_KEY) {
    console.error("Error: CONGRESS_API_KEY environment variable is not set. Skipping Congress data.");
    return false;
  }

  let offset = startOffset;
  const limit = 250; // Max allowed by Congress.gov API
  let hasMore = true;
  let billsProcessed = 0;
  let rateLimitHit = false;

  console.log(`\n--- Fetching historical bills from ${congressNumber}th Congress (starting at offset ${offset}) ---`);

  while (hasMore) {
    const url = `${CONGRESS_API_BASE_URL}/bill/${congressNumber}?api_key=${CONGRESS_API_KEY}&format=json&offset=${offset}&limit=${limit}`;

    console.log(`Fetching Congress ${congressNumber} bills offset ${offset} from: ${url.replace(CONGRESS_API_KEY as string, 'REDACTED_KEY')}`);

    try {
      const response = await fetchWithRetry(url);

      // Handle rate limiting (caught by fetchWithRetry or returned)
      // Actually fetchWithRetry throws on 429, so we catch it below.

      if (!response.ok) {
        console.error(`Error fetching Congress bills offset ${offset}: ${response.status} ${await response.text()}`);
        // Consider this a fatal error for this batch if not 429
        throw new Error(`HTTP Error: ${response.status}`);
      }



      const data: any = await response.json();

      if (data.bills && data.bills.length > 0) {
        // Process bills in parallel batches of 10
        const BATCH_SIZE = 10;
        for (let i = 0; i < data.bills.length; i += BATCH_SIZE) {
          if (rateLimitHit) break;
          const batch = data.bills.slice(i, i + BATCH_SIZE);

          const results = await Promise.allSettled(batch.map(async (bill: any) => {
            try {
              const billId = `congress-bill-${congressNumber}-${bill.type.toLowerCase()}-${bill.number}`;

              const existingLegislation = await getLegislationById(billId);

              const detailUrl = `${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}?api_key=${CONGRESS_API_KEY}&format=json`;
              const detailResponse = await fetchWithRetry(detailUrl);

              if (!detailResponse.ok) {
                console.error(`Error fetching bill details for ${bill.type} ${bill.number}: ${detailResponse.status}`);
                return null;
              }

              const detailData: any = await detailResponse.json();
              const congressBill = detailData.bill;

              // --- AI FILTERING START ---
              const aiRegex = /artificial intelligence|generative ai|automated decision|algorithm/i;
              let hasAiContent = false;

              // Check title
              if (congressBill.title && aiRegex.test(congressBill.title)) {
                hasAiContent = true;
              }

              // Check summaries if not found in title
              if (!hasAiContent) {
                const summariesResponse = await fetchWithRetry(`${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}/summaries?api_key=${CONGRESS_API_KEY}&format=json`);
                if (summariesResponse.ok) {
                  const summaryData: any = await summariesResponse.json();
                  congressBill.summaries = summaryData.summaries; // Store for later

                  if (congressBill.summaries && congressBill.summaries.length > 0) {
                    // Check all summary texts
                    for (const sum of congressBill.summaries) {
                      if (sum.text && aiRegex.test(sum.text)) {
                        hasAiContent = true;
                        break;
                      }
                    }
                  }
                }
              }

              if (!hasAiContent) {
                process.stdout.write('.'); // progress indicator for skipped
                return null;
              }
              console.log(`\nFound AI-related bill: ${bill.type} ${bill.number}`);
              // --- AI FILTERING END ---

              // If bill exists, we might only want to update status/sponsors/history
              // This optimisation saves fetching the huge text body if not needed
              if (existingLegislation) {
                // Note: In strict 'historical' mode, we might want to re-fetch text if missing?
                // For now, let's assume if it exists, we just update metadata.

                // Fetch Actions (History)
                const actionsUrl = `${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}/actions?api_key=${CONGRESS_API_KEY}&format=json&limit=250`;
                const actionsResponse = await fetchWithRetry(actionsUrl);
                let actionsData = { actions: [] };
                if (actionsResponse.ok) {
                  actionsData = await actionsResponse.json();
                }

                // Process and update
                const history = processCongressHistory({ actions: actionsData });
                const sponsors = processCongressSponsors(congressBill);
                const enactedAt = detectEnactedDate(history);

                await updateBillSponsorsAndHistory(billId, sponsors, history, enactedAt);
                return 'processed';
              }

              // NEW BILL: Fetch full text
              const textUrl = `${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}/text?api_key=${CONGRESS_API_KEY}&format=json`;
              const textResponse = await fetchWithRetry(textUrl);

              if (textResponse.ok) {
                congressBill.textVersions = await textResponse.json();
              }

              // Fetch Actions (History) for new bill
              const actionsUrl = `${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}/actions?api_key=${CONGRESS_API_KEY}&format=json&limit=250`;
              const actionsResponse = await fetchWithRetry(actionsUrl);
              if (actionsResponse.ok) {
                congressBill.actions = await actionsResponse.json();
              }

              const legislationToStore = transformCongressBillToMongoDB(congressBill);
              legislationToStore.geminiSummary = null;

              if (legislationToStore.id) {
                await upsertLegislation(legislationToStore);
                console.log(`Inserted new bill: ${bill.type} ${bill.number} (${congressNumber}th Congress)`);
              } else {
                console.warn(`Skipping bill with missing ID: ${bill.type} ${bill.number}`);
              }

              return 'processed';
            } catch (processingError: any) {
              // CRITICAL FIX: If it's a rate limit error, RE-THROW it so we can stop the batch
              if (processingError.message && processingError.message.includes('Rate limit')) {
                throw processingError;
              }

              console.error(`Error processing Congress bill ${bill.type} ${bill.number}:`, processingError);
              return null;
            }
          }));

          // Check if any promise failed due to Rate Limit
          const rateLimitFailure = results.find(r => r.status === 'rejected' && (r.reason?.message?.includes('Rate limit')));
          if (rateLimitFailure && rateLimitFailure.status === 'rejected') {
            throw rateLimitFailure.reason; // Throw to outer loop to trigger 1-hr wait
          }

          // Count successful processing
          billsProcessed += results.filter(r => r.status === 'fulfilled' && r.value === 'processed').length;

          // Small delay between batches to avoid rate limiting
          await delay(2000); // Increased from 100ms to 2000ms
        }

        if (hasMore) {
          offset += limit;
        }
      } else {
        hasMore = false;
      }
    } catch (error: any) {
      if (error.message && error.message.includes('Rate limit')) {
        console.log(`\n*** RATE LIMIT HIT at Congress ${congressNumber}, offset ${offset} ***`);
        console.log('Saving progress for resume...');
        saveProgress(congressNumber, offset, completedCongresses);
        rateLimitHit = true;
        hasMore = false;
        break;
      } else {
        console.error(`Error in main fetch loop for session ${congressNumber}:`, error);
        // Save progress on crash so we can resume
        console.log('Saving progress due to error...');
        saveProgress(congressNumber, offset, completedCongresses);
        return false; // Fatal error, stop
      }
    }
  }

  console.log(`Finished fetching bills from ${congressNumber}th Congress. Processed ${billsProcessed} bills.`);

  // Save progress after completion
  if (!rateLimitHit) {
    saveProgress(congressNumber, offset, [...completedCongresses, congressNumber]);
  }

  return !rateLimitHit; // Return true if completed successfully, false if rate limited
}

function parseArguments(): {
  specificCongress?: number;
  startCongress?: number;
  endCongress?: number;
  runOnce?: boolean;
} {
  const args = process.argv.slice(2);
  let specificCongress: number | undefined;
  let startCongress: number | undefined;
  let endCongress: number | undefined;
  let runOnce: boolean = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--congress':
        if (i + 1 < args.length) {
          specificCongress = parseInt(args[i + 1]);
          i++;
        }
        break;
      case '--start':
        if (i + 1 < args.length) {
          startCongress = parseInt(args[i + 1]);
          i++;
        }
        break;
      case '--end':
        if (i + 1 < args.length) {
          endCongress = parseInt(args[i + 1]);
          i++;
        }
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: node fetchCongressBillsHistorical.js [options]

Options:
  --congress N         Fetch bills from specific Congress session (e.g., --congress 118)
  --start N           Start from specific Congress session (e.g., --start 110)
  --end N             End at specific Congress session (e.g., --end 118)
  --help, -h          Show this help message

Examples:
  node fetchCongressBillsHistorical.js                    # Fetch from predefined historical sessions
  node fetchCongressBillsHistorical.js --congress 118     # Fetch only from 118th Congress
  node fetchCongressBillsHistorical.js --start 115 --end 118  # Fetch from 115th to 118th Congress

Notes:
  - For existing bills, only sponsors and history fields will be updated
  - New bills will be inserted completely
  - The script includes rate limiting to be respectful to the Congress.gov API
        `);
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.warn(`Warning: Unknown argument ${arg}. Use --help for usage information.`);
        }
        break;
    }
  }

  return { specificCongress, startCongress, endCongress, runOnce };
}

// ... existing code ...

/**
 * Fetch bills updated since a specific date/time (Daily Update Mode)
 * Filters for 117th Congress and later
 */
async function fetchDailyUpdates(fromDate: string): Promise<boolean> {
  if (!CONGRESS_API_KEY) {
    console.error("Error: CONGRESS_API_KEY environment variable is not set.");
    return false;
  }

  console.log(`\n=== Starting Daily Update (Bills updated since ${fromDate}) ===`);

  let offset = 0;
  const limit = 250;
  let hasMore = true;
  let billsProcessed = 0;
  let rateLimitHit = false;

  // We use the ALL bills endpoint sorted by update date, filtered by fromDateTime
  // Note: Congress.gov API documentation says /bill supports fromDateTime

  while (hasMore) {
    const url = `${CONGRESS_API_BASE_URL}/bill?api_key=${CONGRESS_API_KEY}&format=json&offset=${offset}&limit=${limit}&fromDateTime=${fromDate}&sort=updateDate_desc`;

    console.log(`Fetching updates offset ${offset} from: ${url.replace(CONGRESS_API_KEY as string, 'REDACTED')}`);

    try {
      const response = await fetchWithRetry(url);
      if (!response.ok) {
        console.error(`Error fetching updates: ${response.status}`);
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data: any = await response.json();

      if (data.bills && data.bills.length > 0) {
        // Filter for 117th Congress +
        // The API returns bills from all congresses. We only want recent ones.
        const recentBills = data.bills.filter((b: any) => {
          return b.congress >= 117;
        });

        if (recentBills.length === 0 && data.bills.length > 0) {
          console.log(`  (Batch has ${data.bills.length} bills, but none >= 117th Congress. Checking next batch...)`);
        } else if (recentBills.length > 0) {
          console.log(`  Processing ${recentBills.length} relevant bills (>= 117th Congress) from batch of ${data.bills.length}`);
        }

        // Process bills in parallel batches of 10
        const BATCH_SIZE = 10;
        for (let i = 0; i < recentBills.length; i += BATCH_SIZE) {
          if (rateLimitHit) break;
          const batch = recentBills.slice(i, i + BATCH_SIZE);

          const results = await Promise.allSettled(batch.map(async (bill: any) => {
            if (rateLimitHit) return null;
            try {
              const congressNumber = bill.congress;
              const billId = `congress-bill-${congressNumber}-${bill.type.toLowerCase()}-${bill.number}`;

              // Always fetch details for updates to ensure we get latest status
              // Use existing logic? The existing logic inside loop is heavily tied to `congressNumber` variable from outer scope.
              // We need to duplicate or adapt the processing logic.
              // For brevity/DRY, I'll essentially copy the core logic here or refactor. 
              // Given tool limitations, I will implement the core logic efficiently here.

              const existingLegislation = await getLegislationById(billId);

              // Fetch Detail
              const detailUrl = `${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}?api_key=${CONGRESS_API_KEY}&format=json`;
              const detailResponse = await fetchWithRetry(detailUrl);

              if (!detailResponse.ok) return null;
              const detailData: any = await detailResponse.json();
              const congressBill = detailData.bill;

              if (existingLegislation) {
                // Update existing
                const actionsUrl = `${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}/actions?api_key=${CONGRESS_API_KEY}&format=json&limit=250`;
                const actionsResponse = await fetchWithRetry(actionsUrl);
                let actionsData = { actions: [] };
                if (actionsResponse.ok) actionsData = await actionsResponse.json();

                const history = processCongressHistory({ actions: actionsData });
                const sponsors = processCongressSponsors(congressBill);
                const enactedAt = detectEnactedDate(history);

                await updateBillSponsorsAndHistory(billId, sponsors, history, enactedAt);
                return 'updated';
              } else {
                // New Bill - Check AI relevance first!
                // Ideally we check AI relevance before full fetch, but we need details for that.
                // We already fetched details (congressBill).

                // --- AI FILTERING ---
                const aiRegex = /\bai\b|artificial intelligence/i;
                let hasAiContent = false;
                if (congressBill.title && aiRegex.test(congressBill.title)) hasAiContent = true;

                if (!hasAiContent) {
                  // Check summaries
                  const summariesResponse = await fetchWithRetry(`${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}/summaries?api_key=${CONGRESS_API_KEY}&format=json`);
                  if (summariesResponse.ok) {
                    const summaryData: any = await summariesResponse.json();
                    congressBill.summaries = summaryData.summaries;
                    if (congressBill.summaries?.some((s: any) => s.text && aiRegex.test(s.text))) {
                      hasAiContent = true;
                    }
                  }
                }

                if (!hasAiContent) return 'skipped-not-ai';

                console.log(`\nFound NEW AI-related bill: ${bill.type} ${bill.number}`);

                // Fetch text
                const textUrl = `${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}/text?api_key=${CONGRESS_API_KEY}&format=json`;
                const textResponse = await fetchWithRetry(textUrl);
                if (textResponse.ok) congressBill.textVersions = await textResponse.json();

                // Fetch Actions
                const actionsUrl = `${CONGRESS_API_BASE_URL}/bill/${congressNumber}/${bill.type.toLowerCase()}/${bill.number}/actions?api_key=${CONGRESS_API_KEY}&format=json&limit=250`;
                const actionsResponse = await fetchWithRetry(actionsUrl);
                if (actionsResponse.ok) congressBill.actions = await actionsResponse.json();

                const legislationToStore = transformCongressBillToMongoDB(congressBill);
                legislationToStore.geminiSummary = null;

                if (legislationToStore.id) {
                  await upsertLegislation(legislationToStore);
                  console.log(`Inserted new bill: ${bill.type} ${bill.number}`);
                }
                return 'inserted';
              }

            } catch (err: any) {
              if (err.message && err.message.includes('Rate limit')) throw err;
              console.error(`Error processing ${bill.type} ${bill.number}`, err);
              return 'error';
            }
          }));

          // Check for rate limit failures
          const rateLimitFailure = results.find(r => r.status === 'rejected' && (r.reason?.message?.includes('Rate limit')));
          if (rateLimitFailure && rateLimitFailure.status === 'rejected') {
            throw rateLimitFailure.reason;
          }

          billsProcessed += results.filter(r => r.status === 'fulfilled' && (r.value === 'updated' || r.value === 'inserted')).length;
          await delay(1000);
        }

        if (data.bills.length < limit) {
          hasMore = false; // End of results
        } else {
          offset += limit;
        }

      } else {
        hasMore = false;
      }
    } catch (error: any) {
      if (error.message && error.message.includes('Rate limit')) {
        console.log(`\n*** RATE LIMIT HIT during daily update ***`);
        rateLimitHit = true;
        break;
      }
      console.error("Error in daily update loop:", error);
      break;
    }
  }

  console.log(`\nDaily update completed. Processed/Updated ${billsProcessed} bills.`);
  return !rateLimitHit;
}

async function main() {
  const { specificCongress, startCongress, endCongress } = parseArguments();

  // NEW: Check for daily update flag or date
  const args = process.argv.slice(2);
  const fromDateIndex = args.indexOf('--from-date');

  if (fromDateIndex !== -1 && args[fromDateIndex + 1]) {
    const fromDate = args[fromDateIndex + 1];
    await fetchDailyUpdates(fromDate);
    process.exit(0);
  }

  // ... rest of existing main function ...
  // Check for saved progress
  const savedProgress = loadProgress();
  // ... existing code ...
  let resumeFromCongress: number | null = null;
  let resumeFromOffset: number = 0;
  let completedCongresses: number[] = [];

  if (savedProgress) {
    console.log(`\n=== Found saved progress from ${savedProgress.lastUpdated} ===`);
    console.log(`Last position: Congress ${savedProgress.currentCongress}, offset ${savedProgress.currentOffset}`);
    console.log(`Completed congresses: ${savedProgress.completedCongresses.join(', ') || 'none'}`);
    resumeFromCongress = savedProgress.currentCongress;
    resumeFromOffset = savedProgress.currentOffset;
    completedCongresses = savedProgress.completedCongresses || [];
  }

  let congressSessions: number[] = [];

  if (specificCongress) {
    congressSessions = [specificCongress];
    console.log(`Fetching bills from ${specificCongress}th Congress only`);
  } else if (startCongress && endCongress) {
    for (let congress = startCongress; congress <= endCongress; congress++) {
      congressSessions.push(congress);
    }
    console.log(`Fetching bills from ${startCongress}th to ${endCongress}th Congress`);
  } else if (startCongress) {
    for (let congress = startCongress; congress <= 119; congress++) {
      congressSessions.push(congress);
    }
    console.log(`Fetching bills from ${startCongress}th Congress to current (119th)`);
  } else {
    congressSessions = HISTORICAL_CONGRESS_SESSIONS;
    console.log(`Fetching bills from predefined historical Congress sessions: ${congressSessions.join(', ')}`);
  }

  console.log(`--- Starting historical Congress bills fetch ---`);
  console.log(`--- Will process ${congressSessions.length} Congress sessions ---`);

  let rateLimitHit = false;

  for (const congressNumber of congressSessions) {
    // Skip already completed congresses
    if (completedCongresses.includes(congressNumber)) {
      console.log(`\nSkipping Congress ${congressNumber} (already completed)`);
      continue;
    }

    // Determine starting offset
    let startOffset = 0;
    if (resumeFromCongress === congressNumber) {
      startOffset = resumeFromOffset;
      console.log(`\nResuming Congress ${congressNumber} from offset ${startOffset}`);
    }

    const success = await fetchHistoricalCongressBills(congressNumber, startOffset, completedCongresses);

    if (!success) {
      rateLimitHit = true;
      console.log('\n=== Rate limit hit. Run the script again later to resume. ===');
      console.log(`Progress saved to: ${PROGRESS_FILE}`);
      break;
    }

    // Update completed list
    if (!completedCongresses.includes(congressNumber)) {
      completedCongresses.push(congressNumber);
    }

    await delay(2000);
  }

  if (!rateLimitHit) {
    console.log("\n--- Finished processing all historical Congress sessions ---");
    console.log("--- For existing bills: updated sponsors and history only ---");
    console.log("--- For new bills: inserted complete records ---");
    console.log("\nClearing progress file (all done!)...");
    clearProgress();
    process.exit(0);
  } else {
    // Rate limit hit - schedule automatic restart in 1 hour
    const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds
    const restartTime = new Date(Date.now() + ONE_HOUR);

    console.log('\n=== Rate Limit Hit - Auto-Restart Scheduled ===');
    console.log(`Progress saved to: ${PROGRESS_FILE}`);
    console.log(`Will automatically restart at: ${restartTime.toLocaleString()}`);
    console.log('Waiting 1 hour for API rate limit to reset...\n');

    // Wait 1 hour
    await delay(ONE_HOUR);

    console.log('\n=== Restarting Congress Bill Fetch ===');
    console.log('API rate limit should be reset now.\n');

    // Recursively call main to restart
    return main();
  }
}

main().catch(err => {
  console.error("Unhandled error in main execution:", err);
  process.exit(1);
});

