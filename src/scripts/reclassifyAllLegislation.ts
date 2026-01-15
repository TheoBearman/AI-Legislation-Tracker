
import { getDb } from '@/lib/mongodb';
import { classifyLegislationTopics } from "@/services/classifyLegislationService";
import fs from 'fs';

const PROGRESS_FILE = './reclassification-progress.json';

function saveProgress(progress: any) {
    try {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    } catch (error) {
        console.warn('Failed to save progress:', error);
    }
}

function loadProgress(): any | null {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        }
    } catch (error) {
        console.warn('Failed to load progress:', error);
    }
    return null;
}

async function classifyAndUpdateBulk(documents: any[], db: any): Promise<number> {
    const bulkOperations = [];
    let classifiedCount = 0;

    for (const doc of documents) {
        try {
            const title = doc.title || '';
            const summary = doc.geminiSummary || doc.summary;
            const abstract = doc.abstracts && doc.abstracts.length > 0
                ? doc.abstracts[0].abstract || doc.abstracts[0].note
                : undefined;

            if (!title && !summary && !abstract) {
                continue;
            }

            const classification = classifyLegislationTopics(title, summary, abstract);

            // Even if empty, we update to clear old tags if they don't match new AI topics
            // But classifyLegislationTopics likely returns at least 'Other' or empty.

            const allTopics = [...classification.broadTopics, ...classification.narrowTopics];

            bulkOperations.push({
                updateOne: {
                    filter: { _id: doc._id },
                    update: {
                        $set: {
                            subjects: allTopics,
                            topicClassification: {
                                broadTopics: classification.broadTopics,
                                narrowTopics: classification.narrowTopics,
                                confidence: classification.confidence,
                                reasoning: classification.reasoning,
                                classifiedAt: new Date()
                            }
                        }
                    }
                }
            });

            classifiedCount++;
        } catch (error: any) {
            console.warn(`Failed to classify document ${doc._id}:`, error.message);
        }
    }

    if (bulkOperations.length > 0) {
        try {
            await db.collection('legislation').bulkWrite(bulkOperations, {
                ordered: false,
                writeConcern: { w: 1, j: false }
            });
        } catch (error: any) {
            console.error('  Bulk update failed:', error.message);
        }
    }

    return classifiedCount;
}

async function main() {
    console.log('Starting FULL legislation re-classification for AI Topics...\n');
    const db = await getDb();

    // Clear old progress if arg provided? Or just manual delete.
    // We'll read progress.

    let query: any = {
        $or: [
            { title: { $exists: true, $not: { $in: [null, ''] } } },
            { geminiSummary: { $exists: true, $not: { $in: [null, ''] } } },
            { summary: { $exists: true, $not: { $in: [null, ''] } } },
            { 'abstracts.0': { $exists: true } }
        ]
    };

    const existingProgress = loadProgress();
    let totalProcessed = 0;

    if (existingProgress?.lastProcessedId) {
        console.log(`Resuming from ID: ${existingProgress.lastProcessedId}`);
        query._id = { $gt: existingProgress.lastProcessedId };
        totalProcessed = existingProgress.totalProcessed || 0;
    }

    const batchSize = 1000;
    const cursor = db.collection('legislation').find(query).sort({ _id: 1 }).batchSize(batchSize);

    let currentBatch = [];
    let batchStartTime = Date.now();

    try {
        for await (const doc of cursor) {
            currentBatch.push(doc);

            if (currentBatch.length >= batchSize) {
                const batchProcessed = await classifyAndUpdateBulk(currentBatch, db);
                totalProcessed += batchProcessed;

                const lastId = currentBatch[currentBatch.length - 1]._id;
                console.log(`Processed ${totalProcessed} documents... (Last ID: ${lastId})`);

                saveProgress({
                    lastProcessedId: lastId,
                    totalProcessed,
                    lastUpdate: new Date().toISOString()
                });

                currentBatch = [];
                // Slight pause to yield event loop
                await new Promise(r => setTimeout(r, 10));
            }
        }

        if (currentBatch.length > 0) {
            await classifyAndUpdateBulk(currentBatch, db);
            totalProcessed += currentBatch.length;
            console.log(`Final batch processed.`);
        }

        console.log(`\nRe-classification complete! Total: ${totalProcessed}`);
        if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
        process.exit(0);

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
