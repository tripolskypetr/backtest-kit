#!/bin/bash
docker build --platform linux/amd64 -t tripolskypetr/tradeforge . -f Dockerfile
docker push tripolskypetr/tradeforge:latest
