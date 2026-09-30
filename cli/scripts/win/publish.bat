@echo off
call docker build --platform linux/amd64 -t tripolskypetr/tradeforge . -f Dockerfile
call docker push tripolskypetr/tradeforge:latest
