#!/bin/bash

npx semverity patch --from version.json:plugin --files version.json:plugin
npx semverity patch --from version.json:plugin --files package.json:version package-lock.json:version,packages..version manifest.json:version --tidy --commit bump

COMMIT="$(git log -1 --pretty=%B)"

git reset --soft HEAD~1
git add version.json

printf '%s\n' "$COMMIT" | git commit -F -
