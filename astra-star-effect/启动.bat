@echo off
chcp 65001 >nul
title Astra Star Effect (unofficial study replica)
cd /d "%~dp0"
start "" "http://127.0.0.1:21418/index/gpt-6-astra/"
node server\server.mjs --side mirror --port 21418 --root site --fallback-root stubs --stub-ext-hosts ab.chatgpt.com,statsigapi.net,cloudflareinsights.com,static.cloudflareinsights.com,chatgpt.com,tidal-rush-paradise-gp.skirano.chatgpt.site,voidexplorer-shipyard.openai.chatgpt.site
pause
