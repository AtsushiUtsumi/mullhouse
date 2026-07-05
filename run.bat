@echo off
cls

for /f "delims=" %%i in ('docker ps -aq') do docker rm -f %%i >nul 2>&1

cls
docker compose up -d --build

rem echo Waiting for backend to be ready...
rem timeout /t 5

rem docker compose exec backend python manage.py makemigrations
rem cls
rem docker compose exec -it backend python manage.py createsuperuser
