import { getCollection, connectToDatabase } from '@/lib/mongodb';

async function checkDuplicates() {
    console.log('Checking for duplicates in legislation collection...');

    // Ensure connection
    await connectToDatabase();
    const collection = await getCollection('legislation');

    // 1. Check for duplicate IDs
    console.log('\n--- Checking for duplicate OpenStates IDs ---');
    const duplicateIds = await collection.aggregate([
        {
            $group: {
                _id: "$id",
                count: { $sum: 1 },
                titles: { $push: "$title" }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        }
    ]).toArray();

    if (duplicateIds.length === 0) {
        console.log('✅ No duplicate OpenStates IDs found.');
    } else {
        console.log(`⚠️ Found ${duplicateIds.length} duplicate IDs:`);
        duplicateIds.forEach(d => {
            console.log(`- ID: ${d._id} (Count: ${d.count})`);
            // console.log(`  Titles: ${d.titles.join(', ')}`);
        });
    }

    // 2. Check for logical duplicates (Identifier + Jurisdiction + Session)
    console.log('\n--- Checking for logical duplicates (Identifier + Jurisdiction + Session) ---');
    const logicalDuplicates = await collection.aggregate([
        {
            $match: {
                // Filter out null/undefined identifiers or sessions if necessary
                identifier: { $exists: true, $ne: null },
                jurisdictionName: { $exists: true, $ne: null },
                session: { $exists: true, $ne: null }
            }
        },
        {
            $group: {
                _id: {
                    identifier: "$identifier",
                    jurisdiction: "$jurisdictionName",
                    session: "$session"
                },
                count: { $sum: 1 },
                ids: { $push: "$id" },
                titles: { $push: "$title" }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        },
        {
            $sort: { count: -1 }
        }
    ]).toArray();

    if (logicalDuplicates.length === 0) {
        console.log('✅ No logical duplicates found.');
    } else {
        console.log(`⚠️ Found ${logicalDuplicates.length} groups of logical duplicates:`);
        logicalDuplicates.slice(0, 20).forEach(d => {
            console.log(`- ${d._id.jurisdiction} ${d._id.session} ${d._id.identifier} (Count: ${d.count})`);
            console.log(`  IDs: ${d.ids.join(', ')}`);
            console.log(`  Titles: ${d.titles[0]}`); // Just show first title
        });
        if (logicalDuplicates.length > 20) {
            console.log(`... and ${logicalDuplicates.length - 20} more.`);
        }
    }

    process.exit(0);
}

checkDuplicates().catch(console.error);
