
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    // 1. Load TopoJSON IDs
    const topoPath = path.join(process.cwd(), 'public/districts/congressional-districts.topojson');
    const topoContent = fs.readFileSync(topoPath, 'utf-8');
    const topoJson = JSON.parse(topoContent);

    // Assume the first object contains the geometries
    const objectKeys = Object.keys(topoJson.objects);
    const geometries = topoJson.objects[objectKeys[0]].geometries;

    // Correctly extract IDs from properties.GEOID
    const mapIds = new Set(geometries.map((g: any) => g.properties?.GEOID));
    console.log(`Loaded ${mapIds.size} district GEOIDs from map keys.`);

    // 2. Load Reps
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Missing MONGODB_URI');
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'statepulse');
    const collection = db.collection('representatives');

    const reps = await collection.find({
        jurisdiction: 'US House',
        map_boundary: { $exists: true }
    }).toArray();

    console.log(`Checking ${reps.length} representatives with map boundaries...`);

    let mismatchCount = 0;
    for (const rep of reps) {
        const geoid = rep.map_boundary.district;
        if (!mapIds.has(geoid)) {
            console.log(`[MISMATCH] ${rep.name} (${rep.state} ${rep.district}) -> GEOID: '${geoid}' NOT FOUND in map.`);
            mismatchCount++;
        }
    }

    if (mismatchCount === 0) {
        console.log("\nSuccess: All representatives map to valid map polygons!");
    } else {
        console.log(`\nFound ${mismatchCount} mismatches.`);
    }

    await client.close();
}

main().catch(console.error);
