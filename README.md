# SkyCast Weather

SkyCast is a responsive Flask weather dashboard powered by OpenWeather. It
shows current conditions, a five-day forecast, hourly details, local city time,
weather alerts when available, and air-quality readings.

## Run locally

1. Create a virtual environment and install dependencies:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and set `OPENWEATHER_API_KEY`.

3. Start the server:

   ```powershell
   py app.py
   ```

Open `http://127.0.0.1:5000/`.

## Deploy

This is a Flask application, so GitHub Pages cannot run it: Pages only serves
static files and cannot execute the `/api/weather` backend. Deploy it to a
Python host such as Render using the included `render.yaml`, then add
`OPENWEATHER_API_KEY` as a secret environment variable in that service.

Never upload `.env` or place the OpenWeather key in frontend JavaScript.
