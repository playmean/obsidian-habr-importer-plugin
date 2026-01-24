#!/bin/bash

VERSION=`npx semverity bump --from version.json:plugin --tidy`

git tag $VERSION
git push origin $VERSION
git push
