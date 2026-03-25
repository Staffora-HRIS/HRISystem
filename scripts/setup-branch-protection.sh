#!/usr/bin/env bash
# =============================================================================
# Setup GitHub Branch Protection Rules for main branch
# =============================================================================
#
# Prerequisites:
#   - GitHub Team plan or higher (branch protection not available on Free plan
#     for private repositories)
#   - gh CLI authenticated: gh auth login
#   - Repository: Staffora-HRIS/HRISystem
#
# Usage:
#   bash scripts/setup-branch-protection.sh
#
# This script configures:
#   1. Require PR reviews (minimum 1 reviewer)
#   2. Require status checks to pass (test.yml, pr-check.yml, codeql.yml)
#   3. Require branches to be up to date before merging
#   4. Block force pushes to main
#   5. Block branch deletion for main
# =============================================================================

set -euo pipefail

REPO="Staffora-HRIS/HRISystem"
BRANCH="main"

echo "Setting up branch protection for ${REPO}/${BRANCH}..."

# Check gh is authenticated
if ! gh auth status &>/dev/null; then
  echo "ERROR: gh CLI not authenticated. Run 'gh auth login' first."
  exit 1
fi

# Apply branch protection rules
gh api "repos/${REPO}/branches/${BRANCH}/protection" \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["test.yml", "pr-check.yml", "codeql.yml"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "Branch protection configured successfully:"
  echo "  - PR reviews required (min 1)"
  echo "  - Status checks required (test.yml, pr-check.yml, codeql.yml)"
  echo "  - Branches must be up to date"
  echo "  - Force pushes blocked"
  echo "  - Branch deletion blocked"
  echo ""
  echo "NOTE: Status check context names must match your GitHub Actions workflow"
  echo "names exactly. If workflows use a 'name:' field, that name is the context"
  echo "instead of the filename. Adjust if needed."
else
  echo ""
  echo "ERROR: Failed to set branch protection."
  echo "This usually means the repository is on GitHub Free plan (private repos)."
  echo "Upgrade to GitHub Team ($4/user/month) at:"
  echo "  https://github.com/organizations/Staffora-HRIS/billing/plans"
fi
