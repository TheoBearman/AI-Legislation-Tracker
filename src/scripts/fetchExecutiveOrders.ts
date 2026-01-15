import { config } from 'dotenv';
import { connectToDatabase } from '@/lib/mongodb';
import { fetchWhitehouseExecutiveOrders } from '@/services/whitehouseScraperService';
import { scrapeStatesExecutiveOrders } from '@/services/governorScraperService';
import { processExecutiveOrderSummarization } from '@/services/executiveOrderAIService';
import { MongoClient } from 'mongodb';

// Load environment variables
config({ path: '../../.env' });

// AI content detection pattern
const AI_PATTERN = /artificial intelligence/i;

interface FetchOptions {
  cutoffDate?: Date;
  includeFederal?: boolean;
  includeWhitehouse?: boolean;
  includeGovernors?: boolean;
  processSummaries?: boolean;
  summaryLimit?: number;
  maxPages?: number;
  aiOnly?: boolean; // NEW: Only keep AI-related executive orders
}

/**
 * Filter out non-AI executive orders from the database
 */
async function filterNonAIExecutiveOrders(): Promise<{ deleted: number; remaining: number }> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI not set');
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'statepulse');
    const executiveOrders = db.collection('executive_orders');

    // Find executive orders that do NOT match AI criteria
    const nonAIQuery = {
      $and: [
        { title: { $not: AI_PATTERN } },
        { summary: { $not: AI_PATTERN } },
        { full_text: { $not: AI_PATTERN } },
        { geminiSummary: { $not: AI_PATTERN } }
      ]
    };

    // Delete non-AI executive orders
    const result = await executiveOrders.deleteMany(nonAIQuery);
    const remaining = await executiveOrders.countDocuments();

    return { deleted: result.deletedCount, remaining };
  } finally {
    await client.close();
  }
}

/**
 * Check if content contains AI-related keywords
 */
function containsAIContent(order: { title?: string; summary?: string; full_text?: string }): boolean {
  const textToCheck = `${order.title || ''} ${order.summary || ''} ${order.full_text || ''}`;
  return AI_PATTERN.test(textToCheck);
}

/**
 * Main function to fetch all executive orders (federal and state)
 */
export async function fetchAllExecutiveOrders(options: FetchOptions = {}) {
  const {
    cutoffDate = new Date(new Date().getTime() - 24 * 60 * 60 * 1000), // one day back,
    includeFederal = false, // Disabled Federal Register API
    includeWhitehouse = true,
    includeGovernors = true, // Enabled governor scraping
    processSummaries = true,
    summaryLimit = 20,
    aiOnly = false // NEW: AI filtering flag
  } = options;

  console.log('Starting executive orders fetch pipeline...');
  console.log(`Options: Federal=${includeFederal}, Whitehouse=${includeWhitehouse}, Governors=${includeGovernors}, CutoffDate=${cutoffDate}, Summaries=${processSummaries}, AI-Only=${aiOnly}`);

  let client;

  try {
    // Connect to database
    const dbConn = await connectToDatabase();
    client = dbConn.client;
    console.log('Connected to MongoDB');

    let federalCount = 0;
    let whitehouseCount = 0;
    let governorCount = 0;

    // Fetch federal executive orders (DISABLED - now using only Whitehouse)
    // if (includeFederal) {
    //   console.log('\nFetching federal executive orders...');
    //   try {
    //     await fetchFederalExecutiveOrders(daysBack);
    //     federalCount++;
    //     console.log('Federal executive orders fetch completed');
    //   } catch (error) {
    //     console.error('Error fetching federal executive orders:', error);
    //   }
    // }

    // Fetch whitehouse executive orders
    if (includeWhitehouse) {
      console.log('\nFetching Whitehouse executive orders...');
      try {
        await fetchWhitehouseExecutiveOrders(cutoffDate, options.maxPages || 100);
        whitehouseCount++;
        console.log('Whitehouse executive orders fetch completed');
      } catch (error) {
        console.error('Error fetching Whitehouse executive orders:', error);
      }
    }

    // Fetch governor executive orders
    if (includeGovernors) {
      console.log('\nScraping governor executive orders...');
      try {
        await scrapeStatesExecutiveOrders();
        governorCount++;
        console.log('Governor executive orders scraping completed');
      } catch (error) {
        console.error('Error scraping governor executive orders:', error);
      }
    }

    // NEW: Filter non-AI executive orders if --ai-only flag is set
    if (aiOnly) {
      console.log('\n--- AI-Only Filter Active: Removing non-AI executive orders ---');
      try {
        const { deleted, remaining } = await filterNonAIExecutiveOrders();
        console.log(`Removed ${deleted} non-AI executive orders`);
        console.log(`Remaining AI-related executive orders: ${remaining}`);
      } catch (error) {
        console.error('Error filtering non-AI executive orders:', error);
      }
    }

    // Process AI summaries
    if (processSummaries) {
      console.log('\nProcessing AI summarization...');
      try {
        await processExecutiveOrderSummarization(summaryLimit);
        console.log('AI summarization completed');
      } catch (error) {
        console.error('Error processing AI summaries:', error);
      }
    }

    console.log('\nExecutive orders pipeline completed successfully!');
    console.log(`Sources processed: Federal=${federalCount}, Whitehouse=${whitehouseCount}, Governors=${governorCount}`);

  } catch (error) {
    console.error('Fatal error in executive orders pipeline:', error);
    process.exit(1);
  } finally {
    if (client) {
      try {
        await client.close();
        console.log('MongoDB connection closed');
      } catch (err) {
        console.error('Error closing MongoDB connection:', err);
      }
    }
  }
}

/**
 * CLI interface for running the script
 */
async function main() {
  const args = process.argv.slice(2);
  const options: FetchOptions = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--cutoff':
        options.cutoffDate = new Date(args[i + 1]);
        i++;
        break;
      case '--no-federal':
        options.includeFederal = false;
        break;
      case '--no-whitehouse':
        options.includeWhitehouse = false;
        break;
      case '--no-governors':
        options.includeGovernors = false;
        break;
      case '--no-summaries':
        options.processSummaries = false;
        break;
      case '--summary-limit':
        options.summaryLimit = parseInt(args[i + 1]);
        i++;
        break;
      case '--max-pages':
        options.maxPages = parseInt(args[i + 1]);
        i++;
        break;
      case '--ai-only':
        options.aiOnly = true;
        break;
      case '--help':
        console.log(`
Usage: npx tsx --env-file=.env.local src/scripts/fetchExecutiveOrders.ts [options]

Options:
  --cutoff <date>        Cutoff date for fetching orders (ISO format)
  --no-federal           Skip federal executive orders
  --no-whitehouse        Skip Whitehouse executive orders
  --no-governors         Skip governor executive orders
  --no-summaries         Skip AI summarization
  --summary-limit <num>  Limit for AI summarization (default: 20)
  --max-pages <num>      Maximum number of Whitehouse pages to fetch (default: 100)
  --ai-only              Only keep executive orders containing "artificial intelligence"
  --help                 Show this help message

Examples:
  npx tsx --env-file=.env.local src/scripts/fetchExecutiveOrders.ts
  npx tsx --env-file=.env.local src/scripts/fetchExecutiveOrders.ts --ai-only
  npx tsx --env-file=.env.local src/scripts/fetchExecutiveOrders.ts --cutoff 2024-01-01 --ai-only
        `);
        process.exit(0);
    }
  }

  await fetchAllExecutiveOrders(options);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });
}
