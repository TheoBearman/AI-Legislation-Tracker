# GitHub Actions Setup for Daily Updates

This guide explains how to set up automated daily database updates using GitHub Actions, allowing you to run the dashboard locally while keeping your cloud database fresh.

## How It Works

The GitHub Actions workflow runs `dailyUpdate.ts` automatically every day at 3 AM UTC. This updates:
- State legislation bills
- Congress bills
- Executive Orders
- Votes (for tracked AI bills)
- Legislator profiles

## Setup Instructions

### 1. Configure GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the following secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/db` | Your MongoDB connection string |
| `OPENSTATES_API_KEY` | Your OpenStates API key | For state legislation data |
| `US_CONGRESS_API_KEY` | Your Congress.gov API key | For federal legislation data |

**To add a secret:**
1. Click "New repository secret"
2. Enter the name (e.g., `MONGODB_URI`)
3. Paste the value
4. Click "Add secret"

### 2. Enable GitHub Actions

The workflow file is already in `.github/workflows/daily-update.yml`. GitHub Actions should be enabled by default, but verify:

1. Go to your repository → **Actions** tab
2. If prompted, click "I understand my workflows, go ahead and enable them"

### 3. Test the Workflow

**Manual Test Run:**
1. Go to **Actions** tab
2. Click "Daily Database Update" in the left sidebar
3. Click "Run workflow" dropdown
4. Click the green "Run workflow" button

This will run the update immediately so you can verify it works.

### 4. Monitor Workflow Runs

**View Logs:**
1. Go to **Actions** tab
2. Click on any workflow run
3. Click "update-database" job to see detailed logs

**Check for Failures:**
- GitHub will email you if a workflow fails
- Failed runs will show a red ❌ in the Actions tab
- Logs are automatically uploaded as artifacts on failure

## Workflow Schedule

The workflow runs automatically:
- **Daily at 3 AM UTC** (adjust in `.github/workflows/daily-update.yml` if needed)
- **On-demand** via the "Run workflow" button

### Change Schedule

Edit `.github/workflows/daily-update.yml`:

```yaml
on:
  schedule:
    - cron: '0 3 * * *'  # Change this line
```

**Cron Examples:**
- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Daily at midnight UTC
- `0 9 * * 1-5` - Weekdays at 9 AM UTC

## Troubleshooting

### Workflow Fails with "Rate Limit"

The daily update script handles rate limits gracefully:
- It saves progress to `data/daily_update_state.json`
- Next run will resume from where it left off
- This is normal for large updates

### Workflow Fails with "Connection Error"

Check your `MONGODB_URI` secret:
1. Verify the connection string is correct
2. Ensure your MongoDB Atlas cluster allows connections from `0.0.0.0/0` (GitHub Actions IPs)
3. Check MongoDB Atlas → Network Access → Add IP Address → Allow Access from Anywhere

### Workflow Doesn't Run

1. Verify the workflow file is in `.github/workflows/` directory
2. Check that GitHub Actions is enabled in repository settings
3. Ensure the repository is not archived
4. Check the Actions tab for any error messages

### View Detailed Logs

```bash
# Download logs locally (requires GitHub CLI)
gh run list --workflow=daily-update.yml
gh run view <run-id> --log
```

## Cost Considerations

GitHub Actions provides:
- **2,000 minutes/month** for free (public repos get unlimited)
- This workflow uses ~5-15 minutes per run
- ~150-450 minutes/month total (well within free tier)

## Local Development

You can still run updates locally:

```bash
# Run the update script manually
npx tsx src/scripts/dailyUpdate.ts

# Check the state file
cat data/daily_update_state.json
```

The local and GitHub Actions runs share the same state file in your database, so they coordinate automatically.

## Security Notes

- ✅ Secrets are encrypted and never exposed in logs
- ✅ Workflow only has read/write access to your repository
- ✅ MongoDB credentials are never committed to git
- ⚠️ Ensure `.env.local` is in `.gitignore` (it already is)

## Monitoring Best Practices

1. **Enable Email Notifications**: GitHub → Settings → Notifications → Actions
2. **Check Weekly**: Review the Actions tab to ensure updates are running
3. **Monitor Database Size**: Keep an eye on MongoDB Atlas metrics
4. **Review Logs**: Occasionally check logs for warnings or errors

## Disable Automatic Updates

To temporarily disable:

1. Go to `.github/workflows/daily-update.yml`
2. Comment out the `schedule:` section:

```yaml
# on:
#   schedule:
#     - cron: '0 3 * * *'
  workflow_dispatch: # Keep manual trigger
```

Or delete the workflow file entirely to permanently disable.
