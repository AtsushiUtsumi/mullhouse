#!/bin/bash
clear
docker rm -f $(docker ps -aq) 2>/dev/null || true
clear
docker compose up -d --build

# echo "Waiting for backend to be ready..."
# sleep 5

# docker compose exec backend python manage.py makemigrations
# clear
#docker compose exec -it backend python manage.py createsuperuser
