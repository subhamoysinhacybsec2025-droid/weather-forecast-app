import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory

load_dotenv()

app = Flask(__name__, template_folder=".")

API_KEY = os.getenv("OPENWEATHER_API_KEY")
BASE_URL = "https://api.openweathermap.org"


def api_get(path, **params):
    if not API_KEY:
        raise RuntimeError("OPENWEATHER_API_KEY is not configured")

    params["appid"] = API_KEY
    response = requests.get(f"{BASE_URL}{path}", params=params, timeout=10)
    response.raise_for_status()
    return response.json()


def format_time(timestamp, timezone_offset=0, fmt="%H:%M"):
    value = datetime.fromtimestamp(timestamp + timezone_offset, tz=timezone.utc)
    if fmt == "%b %-d, %H:%M":
        return f"{value.strftime('%b')} {value.day}, {value.strftime('%H:%M')}"
    if fmt == "%b %-d":
        return f"{value.strftime('%b')} {value.day}"
    return value.strftime(fmt)


def weather_icon(code):
    return f"https://openweathermap.org/img/wn/{code}@2x.png"


def air_quality_label(index):
    return {
        1: ("Good", "good"),
        2: ("Fair", "fair"),
        3: ("Moderate", "moderate"),
        4: ("Poor", "poor"),
        5: ("Very poor", "very-poor"),
    }.get(index, ("Unavailable", "unavailable"))


def get_weather(city):
    locations = api_get("/geo/1.0/direct", q=city, limit=1)
    if not locations:
        raise ValueError(f"No location found for '{city}'")

    location = locations[0]
    lat = location["lat"]
    lon = location["lon"]

    current = api_get("/data/2.5/weather", lat=lat, lon=lon, units="metric")
    timezone_offset = current.get("timezone", 0)
    forecast = api_get("/data/2.5/forecast", lat=lat, lon=lon, units="metric")
    air_quality = None
    try:
        pollution = api_get("/data/2.5/air_pollution", lat=lat, lon=lon)
        pollution_data = pollution.get("list", [{}])[0]
        components = pollution_data.get("components", {})
        aqi = pollution_data.get("main", {}).get("aqi")
        label, category = air_quality_label(aqi)
        air_quality = {
            "index": aqi,
            "label": label,
            "category": category,
            "pm25": round(components.get("pm2_5", 0), 1),
            "pm10": round(components.get("pm10", 0), 1),
            "no2": round(components.get("no2", 0), 1),
            "o3": round(components.get("o3", 0), 1),
        }
    except (requests.RequestException, IndexError, TypeError, AttributeError):
        air_quality = None

    grouped = {}
    for item in forecast.get("list", []):
        day = datetime.fromtimestamp(item["dt"] + timezone_offset, tz=timezone.utc).strftime("%Y-%m-%d")
        grouped.setdefault(day, []).append(item)

    forecast_entries = list(grouped.values())
    hourly_entries = max(forecast_entries, key=len) if forecast_entries else []
    hourly_forecast = []
    for item in hourly_entries:
        item_dt = datetime.fromtimestamp(
            item["dt"] + timezone_offset,
            tz=timezone.utc,
        )
        hourly_forecast.append({
            "time": item_dt.strftime("%H:%M"),
            "temp": round(item["main"]["temp"]),
            "description": item["weather"][0]["description"].title(),
            "icon": weather_icon(item["weather"][0]["icon"]),
            "rain": round(item.get("rain", {}).get("3h", 0), 1),
            "wind": round(item.get("wind", {}).get("speed", 0) * 3.6),
        })

    forecast_days = []
    for entries in list(grouped.values())[:5]:
        rep = min(entries, key=lambda item: abs(int(item["dt_txt"][11:13]) - 12))
        rep_ts = rep["dt"] + timezone_offset
        rep_dt = datetime.fromtimestamp(rep_ts, tz=timezone.utc)

        forecast_days.append({
            "day": rep_dt.strftime("%a"),
            "date": f"{rep_dt.strftime('%b')} {rep_dt.day}",
            "temp": round(rep["main"]["temp"]),
            "low": round(min(item["main"]["temp_min"] for item in entries)),
            "high": round(max(item["main"]["temp_max"] for item in entries)),
            "description": rep["weather"][0]["description"].title(),
            "icon": weather_icon(rep["weather"][0]["icon"]),
            "rain": round(sum(item.get("rain", {}).get("3h", 0) for item in entries), 1),
        })

    alerts = []
    alerts_available = True
    try:
        one_call = api_get("/data/3.0/onecall", lat=lat, lon=lon, units="metric", exclude="minutely,hourly")
        daily_entries = one_call.get("daily", [])
        if daily_entries:
            forecast_days = []
            for index, entry in enumerate(daily_entries[:7]):
                day_dt = datetime.fromtimestamp(
                    entry["dt"] + timezone_offset,
                    tz=timezone.utc,
                )
                weather = entry["weather"][0]
                forecast_days.append({
                    "day": "Today" if index == 0 else day_dt.strftime("%a"),
                    "date": f"{day_dt.strftime('%b')} {day_dt.day}",
                    "temp": round(entry["temp"]["day"]),
                    "low": round(entry["temp"]["min"]),
                    "high": round(entry["temp"]["max"]),
                    "description": weather["description"].title(),
                    "icon": weather_icon(weather["icon"]),
                    "rain": round(entry.get("rain", 0), 1),
                    "pop": round(entry.get("pop", 0) * 100),
                })
        alerts = [
            {
                "event": alert.get("event", "Weather alert"),
                "description": alert.get("description", "Stay aware of changing weather conditions."),
                "start": format_time(alert["start"], timezone_offset, "%b %-d, %H:%M"),
                "end": format_time(alert["end"], timezone_offset, "%b %-d, %H:%M"),
            }
            for alert in one_call.get("alerts", [])
        ]
    except requests.HTTPError as error:
        if error.response is not None and error.response.status_code in (401, 403):
            alerts_available = False

    return {
        "location": ", ".join(filter(None, [location.get("name"), location.get("state"), location.get("country")])),
        "timezone": timezone_offset,
        "is_day": current["sys"]["sunrise"] <= current["dt"] <= current["sys"]["sunset"],
        "current": {
            "temp": round(current["main"]["temp"]),
            "feels_like": round(current["main"]["feels_like"]),
            "description": current["weather"][0]["description"].title(),
            "icon": weather_icon(current["weather"][0]["icon"]),
            "humidity": current["main"]["humidity"],
            "wind": round(current["wind"].get("speed", 0) * 3.6),
            "visibility": round(current.get("visibility", 0) / 1000, 1),
            "pressure": current["main"]["pressure"],
            "sunrise": format_time(current["sys"]["sunrise"], timezone_offset),
            "sunset": format_time(current["sys"]["sunset"], timezone_offset),
        },
        "air_quality": air_quality,
        "hourly": hourly_forecast,
        "forecast": forecast_days,
        "forecast_days_available": len(forecast_days),
        "alerts": alerts,
        "alerts_available": alerts_available,
        "updated": datetime.now(timezone.utc).strftime("%H:%M UTC"),
    }


def get_weather_by_coordinates(latitude, longitude):
    locations = api_get(
        "/geo/1.0/reverse",
        lat=latitude,
        lon=longitude,
        limit=1,
    )
    if not locations:
        raise ValueError("Your current location could not be identified.")
    location = locations[0]
    city = location.get("name")
    if not city:
        raise ValueError("Your current location could not be identified.")
    return get_weather(city)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/style.css")
def stylesheet():
    return send_from_directory(app.root_path, "style.css")


@app.route("/app.js")
def javascript():
    return send_from_directory(app.root_path, "app.js")


@app.route("/api/weather")
def weather_api():
    latitude = request.args.get("lat", type=float)
    longitude = request.args.get("lon", type=float)
    if latitude is not None or longitude is not None:
        if latitude is None or longitude is None or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            return jsonify({"error": "Invalid location coordinates."}), 400
        try:
            return jsonify(get_weather_by_coordinates(latitude, longitude))
        except ValueError as error:
            return jsonify({"error": str(error)}), 404
        except requests.HTTPError as error:
            if error.response is not None and error.response.status_code == 401:
                return jsonify({
                    "error": "OpenWeather rejected the API key. Confirm it is active in your OpenWeather account; new keys may take a short time to activate."
                }), 502
            return jsonify({"error": "Weather service returned an unexpected response. Please try again."}), 502
        except requests.Timeout:
            return jsonify({"error": "OpenWeather took too long to respond. Check your connection and try again."}), 504
        except requests.ConnectionError:
            return jsonify({"error": "Could not connect to OpenWeather. Check your internet connection and try again."}), 502
        except requests.RequestException:
            return jsonify({"error": "Weather service is temporarily unavailable. Please try again."}), 502

    city = request.args.get("city", "London").strip()
    if not city:
        return jsonify({"error": "Please enter a city name."}), 400
    if len(city) > 100:
        return jsonify({"error": "City name must be 100 characters or fewer."}), 400

    try:
        return jsonify(get_weather(city))
    except ValueError as error:
        return jsonify({"error": str(error)}), 404
    except requests.HTTPError as error:
        if error.response is not None and error.response.status_code == 401:
            return jsonify({
                "error": "OpenWeather rejected the API key. Confirm it is active in your OpenWeather account; new keys may take a short time to activate."
            }), 502
        return jsonify({"error": "Weather service returned an unexpected response. Please try again."}), 502
    except requests.RequestException:
        return jsonify({"error": "Weather service is temporarily unavailable. Please try again."}), 502
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 500


@app.route("/health")
def health():
    return jsonify({"status": "ok", "weather_api_configured": bool(API_KEY)})


if __name__ == "__main__":
    app.run(
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",
        port=int(os.getenv("PORT", 5000)),
    )