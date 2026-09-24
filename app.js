const $ = (id) => document.getElementById(id);

const form = $("search-form");
const content = $("weather-content");
const locationButton = $("location-button");
let activeRequest;
let currentWeather;
let temperatureUnit = localStorage.getItem("skycast-unit") || "C";
let clockTimer;
let clockOffsetSeconds = null;

function updateClock() {
  const clock = $("local-clock");
  const now = new Date();
  try {
    if (clockOffsetSeconds === null) {
      // Before a city is loaded, use the browser's actual local timezone.
      clock.textContent = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      return;
    }

    // OpenWeather supplies the city's current UTC offset in seconds. Format
    // the shifted instant as UTC so the browser timezone cannot alter it.
    const cityTime = new Date(now.getTime() + clockOffsetSeconds * 1000);
    clock.textContent = new Intl.DateTimeFormat([], {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(cityTime);
  } catch {
    clock.textContent = now.toLocaleTimeString();
  }
}

updateClock();
clockTimer = setInterval(updateClock, 1000);

function convertTemperature(value) {
  return temperatureUnit === "F" ? Math.round((value * 9) / 5 + 32) : Math.round(value);
}

function formatTemperature(value) {
  return `${convertTemperature(value)}°`;
}

function setTemperatureUnit(unit) {
  temperatureUnit = unit;
  localStorage.setItem("skycast-unit", unit);
  $("celsius-toggle").classList.toggle("active", unit === "C");
  $("fahrenheit-toggle").classList.toggle("active", unit === "F");
  $("celsius-toggle").setAttribute("aria-pressed", String(unit === "C"));
  $("fahrenheit-toggle").setAttribute("aria-pressed", String(unit === "F"));
  if (currentWeather) render(currentWeather);
}

function setTheme(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  const toggle = $("theme-toggle");
  toggle.setAttribute("aria-pressed", String(isDark));
  toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  toggle.querySelector(".theme-icon").textContent = isDark ? "☀" : "☾";
  toggle.querySelector(".theme-label").textContent = isDark ? "Light mode" : "Dark mode";
  localStorage.setItem("skycast-theme", isDark ? "dark" : "light");
}

setTheme(localStorage.getItem("skycast-theme") === "dark");
$("theme-toggle").addEventListener("click", () => {
  setTheme(!document.body.classList.contains("dark-mode"));
});

function showError(message) {
  $("error").textContent = message;
  $("error").classList.remove("d-none");
  content.classList.add("d-none");
}

function hideError() {
  $("error").classList.add("d-none");
}

function setText(id, value) {
  $(id).textContent = value;
}

function renderAirQuality(airQuality) {
  const label = $("aqi-label");
  const index = $("aqi-index");
  const message = $("aqi-message");
  if (!airQuality) {
    index.textContent = "—";
    label.textContent = "Unavailable";
    label.className = "aqi-label unavailable";
    message.textContent = "Air-quality data is temporarily unavailable.";
    ["pm25", "pm10", "no2", "o3"].forEach((pollutant) => setText(`aqi-${pollutant}`, "—"));
    return;
  }
  index.textContent = airQuality.index;
  label.textContent = airQuality.label;
  label.className = `aqi-label ${airQuality.category}`;
  message.textContent = "Lower values generally indicate cleaner air.";
  setText("aqi-pm25", airQuality.pm25);
  setText("aqi-pm10", airQuality.pm10);
  setText("aqi-no2", airQuality.no2);
  setText("aqi-o3", airQuality.o3);
}

function render(data) {
  currentWeather = data;
  if (Number.isFinite(data.timezone)) {
    clockOffsetSeconds = data.timezone;
    const offsetMinutes = Math.abs(Math.round(clockOffsetSeconds / 60));
    const sign = clockOffsetSeconds >= 0 ? "+" : "-";
    const hours = String(Math.floor(offsetMinutes / 60)).padStart(2, "0");
    const minutes = String(offsetMinutes % 60).padStart(2, "0");
    $("clock-zone").textContent = `${data.location.split(",")[0]} · GMT${sign}${hours}:${minutes}`;
    updateClock();
  }
  document.body.classList.toggle("day-mode", data.is_day);
  document.body.classList.toggle("night-mode", !data.is_day);
  const description = data.current.description.toLowerCase();
  const isRainy = /rain|drizzle|thunderstorm|storm/.test(description);
  const isSnowy = data.current.temp <= 10 || /snow|sleet|ice|freez/.test(description);
  const isHot = data.current.temp >= 30 || /hot|clear/.test(description);
  const weatherState = data.is_day ? "Daytime conditions" : "Nighttime conditions";
  const temperaturePercent = Math.max(4, Math.min(96, ((data.current.temp + 10) / 50) * 100));
  document.body.classList.remove(
    "weather-rainy",
    "weather-snowy",
    "weather-sunny",
    "weather-hot",
    "weather-cold",
    "weather-mild",
  );
  document.body.classList.add(
    isRainy
      ? "weather-rainy"
      : isSnowy
        ? "weather-snowy"
        : isHot
          ? "weather-sunny"
          : "weather-mild",
  );
  const stateBadge = $("weather-state");
  const meterFill = $("temperature-meter-fill");
  const meterMarker = $("temperature-meter-marker");
  if (stateBadge) stateBadge.textContent = weatherState;
  if (meterFill) meterFill.style.width = `${temperaturePercent}%`;
  if (meterMarker) meterMarker.style.left = `${temperaturePercent}%`;

  setText("location", data.location);
  setText("updated", `Updated ${data.updated}`);

  $("current-icon").src = data.current.icon;
  $("current-icon").alt = data.current.description;

  setText("temperature", String(convertTemperature(data.current.temp)));
  document.querySelector(".temperature sup").textContent = `°${temperatureUnit}`;
  setText("description", data.current.description);
  setText("feels-like", String(convertTemperature(data.current.feels_like)));
  setText("humidity", `${data.current.humidity}%`);
  setText("pressure", `${data.current.pressure} hPa`);
  setText("wind", `${data.current.wind} km/h`);
  setText("visibility", `${data.current.visibility} km`);
  setText("sunrise", data.current.sunrise);
  setText("sunset", data.current.sunset);
  renderAirQuality(data.air_quality);
  document.querySelector(".daily-forecast-title").textContent =
    `${data.forecast_days_available}-day forecast`;

  $("forecast").innerHTML = data.forecast
    .map(
      (day, index) => `
      <article class="forecast-day ${index === 0 ? "today" : ""}">
        <strong>${index === 0 ? "Today" : day.day}</strong>
        <small>${day.date}</small>
        <img src="${day.icon}" alt="${day.description}">
        <b>${formatTemperature(day.temp)}</b>
        <span>${formatTemperature(day.low)} / ${formatTemperature(day.high)}</span>
        <small>${day.description}</small>
        <small class="rain">💧 ${day.rain} mm${day.pop !== undefined ? ` · ${day.pop}%` : ""}</small>
      </article>
    `,
    )
    .join("");

  $("hourly-forecast").innerHTML = data.hourly.length
    ? data.hourly
        .map(
          (hour, index) => `
          <article class="hourly-item ${index === 0 ? "current-hour" : ""}">
            <strong>${index === 0 ? "Now" : hour.time}</strong>
            <img src="${hour.icon}" alt="${hour.description}">
            <b>${formatTemperature(hour.temp)}</b>
            <small>${hour.description}</small>
            <span>💧 ${hour.rain} mm</span>
            <span>〰 ${hour.wind} km/h</span>
          </article>
        `,
        )
        .join("")
    : '<p class="muted">Hourly forecast is currently unavailable.</p>';

  document.querySelector(".section-heading .muted").textContent =
    `Temperatures in °${temperatureUnit}`;
  content.classList.remove("d-none");
}

async function loadWeather(city = $("city-input").value) {
  const normalizedCity = city.trim();
  if (!normalizedCity) {
    showError("Please enter a city name.");
    return;
  }

  if (window.location.hostname.endsWith("github.io")) {
    showError(
      "GitHub Pages can preview the interface, but it cannot run the Flask weather API. Deploy this project on Render and set OPENWEATHER_API_KEY to enable live weather data.",
    );
    return;
  }

  if (activeRequest) activeRequest.abort();
  activeRequest = new AbortController();
  $("loading").classList.remove("d-none");
  hideError();

  try {
    const response = await fetch(
      `/api/weather?city=${encodeURIComponent(normalizedCity)}`,
      { signal: activeRequest.signal },
    );
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        "The weather backend returned an invalid response. Deploy the Flask app on Render and configure OPENWEATHER_API_KEY.",
      );
    }
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Unable to load weather.");
    render(data);
  } catch (error) {
    if (error.name === "AbortError") return;
    showError(error.message || "Unable to load weather.");
  } finally {
    $("loading").classList.add("d-none");
    activeRequest = null;
  }
}

async function loadCurrentLocation() {
  if (!navigator.geolocation) {
    showError("Your browser does not support location services. Search for a city instead.");
    return;
  }

  locationButton.disabled = true;
  locationButton.classList.add("is-loading");
  hideError();

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        const response = await fetch(
          `/api/weather?lat=${encodeURIComponent(coords.latitude)}&lon=${encodeURIComponent(coords.longitude)}`,
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load your location.");
        $("city-input").value = data.location.split(",")[0];
        render(data);
      } catch (error) {
        showError(error.message || "Unable to load weather for your location.");
      } finally {
        locationButton.disabled = false;
        locationButton.classList.remove("is-loading");
      }
    },
    (error) => {
      const message =
        error.code === error.PERMISSION_DENIED
          ? "Location access was denied. Allow location access or search for a city."
          : "Unable to determine your location. Search for a city instead.";
      showError(message);
      locationButton.disabled = false;
      locationButton.classList.remove("is-loading");
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadWeather();
});

locationButton.addEventListener("click", loadCurrentLocation);
setTemperatureUnit(temperatureUnit);
$("celsius-toggle").addEventListener("click", () => setTemperatureUnit("C"));
$("fahrenheit-toggle").addEventListener("click", () => setTemperatureUnit("F"));
loadWeather();
setInterval(() => loadWeather($("city-input").value), 600000);
