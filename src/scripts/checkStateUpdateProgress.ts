import fs from 'fs';
import path from 'path';

const PROGRESS_FILE = path.resolve(process.cwd(), 'data/state-update-progress.json');

const ALL_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

interface UpdateProgress {
    completedStates: string[];
    lastUpdated: string;
}

function checkProgress() {
    console.log('\n=== State Update Progress ===\n');

    if (!fs.existsSync(PROGRESS_FILE)) {
        console.log('❌ No progress file found.');
        console.log(`All ${ALL_STATES.length} states need to be processed.\n`);
        console.log('Outstanding states:');
        console.log(ALL_STATES.join(', '));
        return;
    }

    try {
        const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
        const progress: UpdateProgress = JSON.parse(data);

        const completedCount = progress.completedStates.length;
        const remainingStates = ALL_STATES.filter(s => !progress.completedStates.includes(s));
        const remainingCount = remainingStates.length;

        console.log(`✅ Completed: ${completedCount}/${ALL_STATES.length} states`);
        console.log(`⏸️  Remaining: ${remainingCount}/${ALL_STATES.length} states`);
        console.log(`Last updated: ${new Date(progress.lastUpdated).toLocaleString()}\n`);

        if (completedCount > 0) {
            console.log('Completed states:');
            console.log(progress.completedStates.sort().join(', '));
            console.log('');
        }

        if (remainingCount > 0) {
            console.log('Outstanding states:');
            console.log(remainingStates.sort().join(', '));
            console.log('');
            console.log(`To process remaining states, run:`);
            console.log(`npx tsx src/scripts/updateStateBills.ts`);
            console.log('');
            console.log(`Or process specific states:`);
            console.log(`npx tsx src/scripts/updateStateBills.ts ${remainingStates.slice(0, 5).join(' ')}`);
        } else {
            console.log('🎉 All states have been processed!');
        }

    } catch (error) {
        console.error('Error reading progress file:', error);
    }
}

checkProgress();
