#!/bin/bash
npm install --verbose
npm run build
cd modules
for D in `find . -maxdepth 1 -not -path "." -not -path "./.*" -type d`
do
    cd $D
    echo $D
    npm install --verbose
    npm run build
    cd ..
done
cd ..
