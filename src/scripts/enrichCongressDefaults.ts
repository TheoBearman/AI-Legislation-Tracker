
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// State name to FIPS code mapping
const STATE_FIPS: { [key: string]: string } = {
    'Alabama': '01', 'Alaska': '02', 'Arizona': '04', 'Arkansas': '05', 'California': '06',
    'Colorado': '08', 'Connecticut': '09', 'Delaware': '10', 'District of Columbia': '11', 'Florida': '12',
    'Georgia': '13', 'Hawaii': '15', 'Idaho': '16', 'Illinois': '17', 'Indiana': '18',
    'Iowa': '19', 'Kansas': '20', 'Kentucky': '21', 'Louisiana': '22', 'Maine': '23',
    'Maryland': '24', 'Massachusetts': '25', 'Michigan': '26', 'Minnesota': '27', 'Mississippi': '28',
    'Missouri': '29', 'Montana': '30', 'Nebraska': '31', 'Nevada': '32', 'New Hampshire': '33',
    'New Jersey': '34', 'New Mexico': '35', 'New York': '36', 'North Carolina': '37', 'North Dakota': '38',
    'Ohio': '39', 'Oklahoma': '40', 'Oregon': '41', 'Pennsylvania': '42', 'Rhode Island': '44',
    'South Carolina': '45', 'South Dakota': '46', 'Tennessee': '47', 'Texas': '48', 'Utah': '49',
    'Vermont': '50', 'Virginia': '51', 'Washington': '53', 'West Virginia': '54', 'Wisconsin': '55',
    'Wyoming': '56', 'American Samoa': '60', 'Guam': '66', 'Northern Mariana Islands': '69',
    'Puerto Rico': '72', 'Virgin Islands': '78'
};

const AT_LARGE_STATES = ['Alaska', 'Delaware', 'North Dakota', 'South Dakota', 'Vermont', 'Wyoming', 'District of Columbia'];

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Missing MONGODB_URI');

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'statepulse');
    const collection = db.collection('representatives');

    // Fetch all US House representatives
    const houseReps = await collection.find({ jurisdiction: 'US House' }).toArray();
    console.log(`Found ${houseReps.length} US House representatives.`);

    let updatedCount = 0;

    for (const rep of houseReps) {
        if (!rep.state) {
            console.log(`Skipping ${rep.name}: Missing state`);
            continue;
        }

        const stateFips = STATE_FIPS[rep.state];
        if (!stateFips) {
            console.log(`Skipping ${rep.name}: Unknown state '${rep.state}'`);
            continue;
        }

        let districtStr = '00';
        if (rep.district === null || rep.district === undefined) {
            if (AT_LARGE_STATES.includes(rep.state)) {
                districtStr = '00';
            } else {
                // Likely a Senator or Delegate without district data
                // console.log(`Skipping ${rep.name}: District is null/undefined`);
                continue;
            }
        } else {
            let districtNum = parseInt(rep.district.toString(), 10);
            if (isNaN(districtNum)) districtNum = 0;
            districtStr = districtNum.toString().padStart(2, '0');
        }

        const geoid = `${stateFips}${districtStr}`;

        // Construct the map boundary object
        const mapBoundary = {
            district: geoid, // This is what the map likely uses (e.g. 2902)
            state_fips: stateFips,
            district_code: districtStr
        };

        // Update the document
        await collection.updateOne(
            { _id: rep._id },
            { $set: { map_boundary: mapBoundary } }
        );
        updatedCount++;
        // console.log(`Updated ${rep.name} (${rep.state} ${rep.district || 'At-Large'}) -> GEOID: ${geoid}`);
    }

    console.log(`Successfully updated ${updatedCount} representatives with GEOID map boundaries.`);
    await client.close();
}

main().catch(console.error);
