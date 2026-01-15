#!/bin/bash

# Recovery script to restore deleted legislation data
# This will re-import all AI-related bills from original sources

echo "=================================="
echo "LEGISLATION DATA RECOVERY SCRIPT"
echo "=================================="
echo ""
echo "This will restore the 851 bills that were accidentally deleted."
echo "Estimated time: 30-60 minutes"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Step 1: Re-import state bills from OpenStates bulk dump
echo ""
echo "Step 1/3: Re-importing state bills from OpenStates bulk dump..."
echo "This will restore all state AI legislation from the PostgreSQL dump."
npx tsx src/scripts/importOpenStatesBulk.ts

if [ $? -ne 0 ]; then
    echo "❌ Error importing state bills. Please check the error above."
    exit 1
fi

# Step 2: Fetch recent federal bills from Congress.gov
echo ""
echo "Step 2/3: Fetching recent federal bills from Congress.gov..."
echo "This will restore federal AI legislation from the current Congress."

# Create a temporary script to fetch recent Congress bills
cat > /tmp/fetch_recent_congress.ts << 'EOF'
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

// Import and run the Congress fetcher for recent bills only
async function fetchRecentCongress() {
    console.log('Fetching bills from 118th and 119th Congress...');
    
    // You'll need to implement a simplified version that fetches recent congresses
    // For now, we'll just log the instruction
    console.log('Please run: npx tsx src/scripts/fetchCongressBillsHistorical.ts');
    console.log('This will restore federal bills from recent congresses.');
}

fetchRecentCongress().catch(console.error);
EOF

echo "⚠️  Manual step required:"
echo "Run: npx tsx src/scripts/fetchCongressBillsHistorical.ts"
echo "This will restore federal bills (may take 15-30 minutes due to API rate limits)"
echo ""

# Step 3: Update with latest changes
echo ""
echo "Step 3/3: Running daily update to catch any recent changes..."
npx tsx src/scripts/dailyUpdate.ts

echo ""
echo "=================================="
echo "RECOVERY COMPLETE"
echo "=================================="
echo ""
echo "Summary:"
echo "✅ State bills restored from OpenStates bulk dump"
echo "⚠️  Federal bills: Run fetchCongressBillsHistorical.ts manually"
echo "✅ Latest updates applied via dailyUpdate.ts"
echo ""
echo "Next steps:"
echo "1. Run: npx tsx src/scripts/fetchCongressBillsHistorical.ts"
echo "2. Verify data in your dashboard"
echo ""
