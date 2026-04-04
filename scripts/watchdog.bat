@echo off
:: Copilot Session Portal — Watchdog
:: Delegates to PowerShell for reliable execution.
::
:: Install:  schtasks /create /tn "CopilotPortalWatchdog" /tr "C:\Users\vinodata\Projects\CLIRemote\scripts\watchdog.bat" /sc minute /mo 30 /f
:: Remove:   schtasks /delete /tn "CopilotPortalWatchdog" /f

powershell -ExecutionPolicy Bypass -File "%~dp0watchdog.ps1"
