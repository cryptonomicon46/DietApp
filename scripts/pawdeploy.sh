#!/bin/bash
# 🚀 pawdeploy: bring this copy of the code up to date and deploy the connector (the Cloudflare
# Worker in server/). It deploys the branch you have checked out — normally main — and runs from
# any folder. Your storage id in server/wrangler.toml is a local change: it's set aside for the
# pull and put back.
#
# Once, from the project folder (Git Bash on Windows: ~/.bashrc; Mac: ~/.zshrc):
#   echo "alias pawdeploy='bash \"$(pwd)/scripts/pawdeploy.sh\"'" >> ~/.bashrc && source ~/.bashrc
#
# Everything is inside { … exit; } so bash reads the whole script before the pull can change it.
{
set -e
cd "$(dirname "$0")/.."
branch=$(git rev-parse --abbrev-ref HEAD)
echo "Updating and deploying the connector from branch: $branch"

stashed=
if ! git diff --quiet HEAD; then git stash push -q -m pawdeploy; stashed=1; fi
pulled=1
git pull --ff-only || pulled=
if [ -n "$stashed" ] && ! git stash pop -q; then
  # The update changed a line you had changed too: take the updated file, keep yours aside.
  clash=$(git diff --name-only --diff-filter=U)
  for f in $clash; do git checkout -q HEAD -- "$f"; done
  git reset -q
  echo "The update changed the same lines as your local changes in: $clash"
  echo "Your version is kept ('git stash show -p' shows it). Put your storage id back in"
  echo "server/wrangler.toml ('cd server && npx wrangler kv namespace list' shows it), then run pawdeploy again."
  exit 1
fi
if [ -z "$pulled" ]; then echo "The pull didn't work (see above); nothing was deployed."; exit 1; fi

if grep -q PASTE_KV_NAMESPACE_ID_HERE server/wrangler.toml; then
  echo "server/wrangler.toml still says PASTE_KV_NAMESPACE_ID_HERE; nothing was deployed."
  echo "Run 'cd server && npx wrangler kv namespace list', paste your HOUSEHOLD id into wrangler.toml, then pawdeploy again."
  exit 1
fi

cd server
npm install --silent
npx wrangler deploy
echo "Deployed the connector from $branch."
exit
}
