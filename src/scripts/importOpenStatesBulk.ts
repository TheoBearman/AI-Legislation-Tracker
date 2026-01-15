#!/usr/bin/env tsx
/**
 * Import State Legislation from OpenStates PostgreSQL Bulk Dump
 * 
 * This script:
 * 1. Restores the OpenStates PostgreSQL dump to a local database
 * 2. Queries for AI-related legislation
 * 3. Imports matching bills to MongoDB
 * 
 * Prerequisites:
 * - PostgreSQL installed locally (brew install postgresql)
 * - The dump file downloaded to data/openstates/2026-01-public.pgdump
 * 
 * Usage:
 *   npx tsx src/scripts/importOpenStatesBulk.ts --restore   # Restore dump to Postgres
 *   npx tsx src/scripts/importOpenStatesBulk.ts --import    # Import AI bills to MongoDB
 *   npx tsx src/scripts/importOpenStatesBulk.ts --all       # Do both
 */

import { config } from 'dotenv';
import path from 'path';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { Pool } from 'pg';
import { upsertLegislation } from '@/services/legislationService';
import { getCollection } from '@/lib/mongodb';

// ... (existing imports)

const execAsync = promisify(exec);

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

const DATA_DIR = path.resolve(process.cwd(), 'data/openstates');
const DUMP_FILE = path.join(DATA_DIR, '2026-01-public.pgdump');
const PG_DATABASE = 'openstates_import';

// AI content detection - using specific terms to avoid false positives
const AI_KEYWORDS = [
    'artificial intelligence',
    'generative ai',
    'machine learning',
    'deep learning',
    'neural network',
    'large language model',
    'llm',
    'chatgpt',
    'deepfake',
    'facial recognition',
    'biometric',
    'automated decision making',
    'algorithmic bias',
    'ai system',
    'ai model',
    'ai technology'
];

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

function toMongoDate(dateInput: string | Date | null | undefined): Date | null {
    if (!dateInput) return null;
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date;
}

async function checkPostgresInstalled(): Promise<boolean> {
    try {
        execSync('which psql', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

async function createDatabase(): Promise<void> {
    console.log(`Creating database ${PG_DATABASE}...`);
    try {
        await execAsync(`createdb ${PG_DATABASE} 2>/dev/null || true`);
        console.log('Database ready');
    } catch (err) {
        console.log('Database may already exist, continuing...');
    }
}

async function restoreDump(): Promise<void> {
    const schemaFile = path.join(DATA_DIR, '2026-01-schema.pgdump');

    if (!fs.existsSync(DUMP_FILE) || !fs.existsSync(schemaFile)) {
        console.error(`Missing dump files.`);
        console.log(`  Schema: ${schemaFile} (${fs.existsSync(schemaFile) ? 'Found' : 'Missing'})`);
        console.log(`  Data: ${DUMP_FILE} (${fs.existsSync(DUMP_FILE) ? 'Found' : 'Missing'})`);
        process.exit(1);
    }

    console.log('1. Restoring PostgreSQL Schema...');
    try {
        await execAsync(`pg_restore --clean --if-exists --no-owner --no-acl -d ${PG_DATABASE} "${schemaFile}" 2>&1 || true`);
        console.log('Schema restore complete.');
    } catch (err) {
        console.log('Schema restore finished with warnings.');
    }

    console.log('2. Restoring PostgreSQL Data (this WILL take a while - 10GB)...');
    try {
        await execAsync(`pg_restore --no-owner --no-acl --data-only --disable-triggers -d ${PG_DATABASE} "${DUMP_FILE}" 2>&1 || true`, {
            maxBuffer: 1024 * 1024 * 100
        });
        console.log('Data restore complete!');
    } catch (err: any) {
        console.log('Data restore finished with warnings.');
    }
}

async function importAIBills(pool: Pool): Promise<void> {
    const mongoUri = process.env.MONGODB_URI || 'local';
    const displayUri = mongoUri.includes('@') ?
        mongoUri.split('@')[1].split('/')[0] :
        'localhost';

    console.log('\n=== Importing AI-related legislation to MongoDB ===');
    console.log(`Target MongoDB: ${displayUri} (configured in .env.local)\n`);


    // Build the WHERE clause for explicit AI mentions only
    const aiConditions = `(
        b.title ILIKE '%artificial intelligence%' OR 
        bs.abstract ILIKE '%artificial intelligence%' OR
        b.title ~* '\\mai\\M' OR
        bs.abstract ~* '\\mai\\M'
    )`;

    // Query for AI-related bills with all their data
    const query = `
            SELECT DISTINCT ON (b.id)
                b.id,
                b.identifier,
                b.title,
                b.legislative_session_id,
                ls.identifier as session_identifier,
                j.id as jurisdiction_id,
                j.name as jurisdiction_name,
                b.classification,
                b.subject,
                b.latest_action_date,
                b.latest_action_description,
                b.first_action_date,
                b.created_at,
                b.created_at,
                b.updated_at
            FROM opencivicdata_bill b
            JOIN opencivicdata_legislativesession ls ON b.legislative_session_id = ls.id
            JOIN opencivicdata_jurisdiction j ON ls.jurisdiction_id = j.id
            LEFT JOIN opencivicdata_billabstract bs ON bs.bill_id = b.id
            WHERE (${aiConditions})
            AND b.created_at >= '2020-01-01'
            ORDER BY b.id, b.updated_at DESC
        `;

    console.log('Querying for AI-related bills since 2020...');
    const result = await pool.query(query);
    console.log(`Found ${result.rows.length} AI-related bills\n`);

    let imported = 0;
    for (const row of result.rows) {
        try {
            // Get sponsors for this bill
            const sponsorsResult = await pool.query(`
                    SELECT name, entity_type, "primary", classification
                    FROM opencivicdata_billsponsorship
                    WHERE bill_id = $1
                `, [row.id]);

            // Get actions for this bill
            const actionsResult = await pool.query(`
                    SELECT date, description, classification, "order"
                    FROM opencivicdata_billaction
                    WHERE bill_id = $1
                    ORDER BY "order"
                `, [row.id]);

            // Get abstracts for this bill
            const abstractsResult = await pool.query(`
                    SELECT abstract, note
                    FROM opencivicdata_billabstract
                    WHERE bill_id = $1
                `, [row.id]);

            // Get versions for this bill
            const versionsResult = await pool.query(`
                    SELECT note, date, classification
                    FROM opencivicdata_billversion
                    WHERE bill_id = $1
                `, [row.id]);

            // Get sources for this bill
            const sourcesResult = await pool.query(`
                    SELECT url, note
                    FROM opencivicdata_billsource
                    WHERE bill_id = $1
                `, [row.id]);

            const legislation = {
                id: displayOpenStatesId(row.id),
                identifier: row.identifier,
                title: row.title,
                session: row.session_identifier,
                jurisdictionId: row.jurisdiction_id,
                jurisdictionName: row.jurisdiction_name,
                classification: row.classification || [],
                subjects: row.subject || [],
                statusText: row.latest_action_description,
                sponsors: sponsorsResult.rows.map(s => ({
                    name: s.name,
                    id: null,
                    entityType: s.entity_type,
                    primary: s.primary,
                    classification: s.classification,
                    personId: null,
                    organizationId: null,
                })),
                history: actionsResult.rows.map(a => ({
                    date: toMongoDate(a.date),
                    action: a.description,
                    actor: 'Legislature',
                    classification: a.classification || [],
                    order: a.order,
                })),
                versions: versionsResult.rows.map(v => ({
                    note: v.note,
                    date: toMongoDate(v.date),
                    classification: v.classification,
                    links: [],
                })),
                sources: sourcesResult.rows.map(s => ({
                    url: s.url,
                    note: s.note,
                })),
                abstracts: abstractsResult.rows.map(a => ({
                    abstract: a.abstract,
                    note: a.note,
                })),
                openstatesUrl: undefined, // Field not present in bulk dump
                stateLegislatureUrl: '',
                firstActionAt: toMongoDate(row.first_action_date),
                latestActionAt: toMongoDate(row.latest_action_date),
                latestActionDescription: row.latest_action_description,
                createdAt: toMongoDate(row.created_at) || new Date(),
                updatedAt: toMongoDate(row.updated_at) || new Date(),
                summary: abstractsResult.rows[0]?.abstract || null,
                geminiSummary: null,
            };

            await upsertLegislation(legislation);
            imported++;

            if (imported % 10 === 0) {
                console.log(`[${imported}/${result.rows.length}] Imported: ${row.identifier} - ${row.title?.substring(0, 50)}...`);
            }
        } catch (err) {
            console.error(`Error importing ${row.identifier}:`, err);
        }
    }

    console.log(`\n=== Import complete! Imported ${imported} AI-related bills ===`);
}


async function importLegislators(pool: Pool): Promise<void> {
    console.log('\n=== Importing Legislators ===');
    const collection = await getCollection('legislators');

    // Fetch people with their latest party membership
    // Note: This is a simplification. People can have multiple memberships.
    // We try to get the most recent one.
    const query = `
        SELECT DISTINCT ON (p.id)
            p.id,
            p.name,
            p.family_name,
            p.given_name,
            p.image,
            p.gender,
            p.biography,
            p.birth_date,
            p.death_date,
            p.created_at,
            p.updated_at,
            m.organization_id,
            org.name as party_name,
            post.label as district,
            j.name as state
        FROM opencivicdata_person p
        LEFT JOIN opencivicdata_membership m ON m.person_id = p.id
        LEFT JOIN opencivicdata_organization org ON m.organization_id = org.id
        LEFT JOIN opencivicdata_post post ON m.post_id = post.id
        LEFT JOIN opencivicdata_organization post_org ON post.organization_id = post_org.id
        LEFT JOIN opencivicdata_jurisdiction j ON post_org.jurisdiction_id = j.id
        WHERE org.classification = 'party'
        ORDER BY p.id, m.end_date DESC NULLS FIRST
    `;

    console.log('Querying legislators...');
    const result = await pool.query(query);
    console.log(`Found ${result.rows.length} legislators.`);

    let count = 0;
    const batchSize = 1000;
    let batch = [];

    for (const row of result.rows) {
        batch.push({
            updateOne: {
                filter: { id: displayOpenStatesId(row.id) },
                update: {
                    $set: {
                        id: displayOpenStatesId(row.id),
                        name: row.name,
                        givenName: row.given_name,
                        familyName: row.family_name,
                        image: row.image,
                        party: row.party_name,
                        state: row.state,
                        district: row.district,
                        gender: row.gender,
                        biography: row.biography,
                        updatedAt: new Date()
                    }
                },
                upsert: true
            }
        });

        if (batch.length >= batchSize) {
            await collection.bulkWrite(batch);
            count += batch.length;
            process.stdout.write(`.`);
            batch = [];
        }
    }

    if (batch.length > 0) {
        await collection.bulkWrite(batch);
        count += batch.length;
    }
    console.log(`\nImported/Updated ${count} legislators.`);
}

async function importVotes(pool: Pool): Promise<void> {
    console.log('\n=== Importing Votes (for AI bills only) ===');
    const billsCollection = await getCollection('legislation');
    const votesCollection = await getCollection('votes');

    // 1. Get IDs of AI bills we just imported
    const aiBills = await billsCollection.find({}, { projection: { id: 1 } }).toArray();
    const aiBillIds = aiBills.map(b => 'ocd-bill/' + b.id.replace('ocd-bill_', '')).filter(id => id.startsWith('ocd-bill/'));

    if (aiBillIds.length === 0) {
        console.log('No AI bills found in MongoDB to link votes to.');
        return;
    }

    console.log(`Looking for votes linked to ${aiBillIds.length} AI bills...`);

    // We can't pass thousands of IDs in IN clause easily, so we might need to batch or fetch all votes linked to *any* bill
    // Better strategy: Query vote events joined with bills where bill title is AI related? 
    // Or just iterate our known IDs. Iterating 1000 IDs is fine.

    // Actually, simpler to query local postgres for votes linked to the bills we found in the first step (importAIBills)
    // But importAIBills is separate.
    // Let's use the same AI keyword filter on the postgres side to find relevant votes.
    const aiConditions = AI_KEYWORDS.map(kw =>
        `(b.title ILIKE '%${kw}%' OR bs.abstract ILIKE '%${kw}%')`
    ).join(' OR ');

    const query = `
        SELECT 
            v.id,
            v.identifier,
            v.motion_text,
            v.result,
            v.start_date,
            v.bill_id,
            b.identifier as bill_identifier,
            ls.identifier as session,
            j.name as jurisdiction
        FROM opencivicdata_voteevent v
        JOIN opencivicdata_bill b ON v.bill_id = b.id
        JOIN opencivicdata_legislativesession ls ON v.legislative_session_id = ls.id
        JOIN opencivicdata_jurisdiction j ON ls.jurisdiction_id = j.id
        LEFT JOIN opencivicdata_billabstract bs ON bs.bill_id = b.id
        WHERE (${aiConditions})
        AND v.start_date >= '2020-01-01'
    `;

    console.log('Querying votes...');
    const result = await pool.query(query);
    console.log(`Found ${result.rows.length} related vote events.`);

    for (const row of result.rows) {
        // Fetch roll call details for this vote
        const rollCallRes = await pool.query(`
            SELECT option, value
            FROM opencivicdata_votecount
            WHERE vote_event_id = $1
        `, [row.id]);

        const votesRes = await pool.query(`
            SELECT option, voter_name, voter_id
            FROM opencivicdata_personvote
            WHERE vote_event_id = $1
        `, [row.id]);

        const voteDoc = {
            id: displayOpenStatesId(row.id),
            billId: displayOpenStatesId(row.bill_id),
            motion: row.motion_text,
            result: row.result,
            date: toMongoDate(row.start_date),
            counts: rollCallRes.rows,
            votes: votesRes.rows.map(v => ({
                option: v.option,
                voterName: v.voter_name,
                voterId: v.voter_id ? displayOpenStatesId(v.voter_id) : null
            }))
        };

        await votesCollection.updateOne(
            { id: voteDoc.id },
            { $set: voteDoc },
            { upsert: true }
        );
    }
    console.log(`Imported ${result.rows.length} vote events.`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
OpenStates Bulk Import Script

This script imports state legislation from the OpenStates PostgreSQL dump.

Usage:
  npx tsx src/scripts/importOpenStatesBulk.ts [options]

Options:
  --restore     Restore the PostgreSQL dump to local database
  --import      Import AI-related bills from PostgreSQL to MongoDB
  --all         Do both restore and import
  --help, -h    Show this help message

Prerequisites:
  1. PostgreSQL installed: brew install postgresql
  2. Dump file downloaded to data/openstates/2026-01-public.pgdump
        `);
        process.exit(0);
    }

    // Check prerequisites
    if (!await checkPostgresInstalled()) {
        console.error('PostgreSQL not installed. Run: brew install postgresql');
        process.exit(1);
    }

    const doRestore = args.includes('--restore') || args.includes('--all');
    const doImport = args.includes('--import') || args.includes('--all');

    if (!doRestore && !doImport) {
        console.log('No action specified. Use --restore, --import, or --all');
        console.log('Use --help for more information');
        process.exit(1);
    }

    if (doRestore) {
        await createDatabase();
        await restoreDump();
    }

    if (doImport) {
        const pool = new Pool({
            database: PG_DATABASE,
            host: 'localhost',
        });

        try {
            await importLegislators(pool);
            await importAIBills(pool);
            await importVotes(pool);
        } finally {
            await pool.end();
        }
    }

    console.log('\nDone!');
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
