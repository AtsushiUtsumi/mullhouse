
set "ADDRESS=%~1"
if "%ADDRESS%"=="" set "ADDRESS=http://localhost"

python -u bots\simple_bot.py --site-url %ADDRESS% --base-url %ADDRESS%/api/poker --name SIMPLE_BOT --small-blind 25 --big-blind 50 --buy-in 5000
