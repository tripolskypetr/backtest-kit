@echo off
call npm install --verbose
call npm run build
cd modules
for /d %%D in (*) do (
    if not "%%D"=="." if not "%%D"==".." (
        cd "%%D"
        echo %%D
        call npm install --verbose
        call npm run build
        cd ..
    )
)
cd ..
