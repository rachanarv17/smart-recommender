let map;
let userLat, userLon;
let routeLayer;
let placeMarkers = [];

let favorites = JSON.parse(localStorage.getItem("favorites")) || [];
let history = JSON.parse(localStorage.getItem("history")) || [];

/* ---------------- SCREEN FLOW ---------------- */

function goToLogin() {
  document.getElementById("intro").classList.add("hidden");
  document.getElementById("login").classList.remove("hidden");
}

function login() {
  document.getElementById("login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  initUserLocation();
  loadFavorites();
  loadHistory();
}

/* ---------------- THEME ---------------- */

function toggleTheme() {
  document.body.classList.toggle("dark");
}

/* ---------------- MAP ---------------- */

function initUserLocation() {
  navigator.geolocation.getCurrentPosition(position => {
    userLat = position.coords.latitude;
    userLon = position.coords.longitude;

    map = L.map("map").setView([userLat, userLon], 14);

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    ).addTo(map);

    L.marker([userLat, userLon])
      .addTo(map)
      .bindPopup("📍 You are here")
      .openPopup();
  });
}

/* ---------------- SEARCH ---------------- */

async function findPlaces(customMood, customBudget) {

  const mood = customMood || document.getElementById("mood").value;
  const budget = customBudget || document.getElementById("priceFilter").value;

  saveHistory(mood, budget);

  const results = document.getElementById("results");
  results.innerHTML = "🔎 Searching...";

  const query = `
    [out:json];
    node["amenity"="${mood}"](around:3000, ${userLat}, ${userLon});
    out;
  `;

  const response = await fetch(
    "https://overpass-api.de/api/interpreter",
    { method: "POST", body: query }
  );

  const data = await response.json();

  if (!data.elements.length) {
    results.innerHTML = "No places found.";
    return;
  }

  const ranked = data.elements.map(place => {

    const distance = calculateDistance(userLat, userLon, place.lat, place.lon);
    const rating = Math.max(3, (5 - distance/2)).toFixed(1);
    const priceLevel = Math.floor(Math.random()*3)+1;
    const approxCost = generateApproxCost(priceLevel);
    const score = calculateAIScore(distance, rating, priceLevel, budget);

    return {
      ...place,
      distance,
      rating,
      priceLevel,
      approxCost,
      score
    };
  });

  ranked.sort((a,b) => b.score - a.score);
  displayResults(ranked.slice(0,6));
}

/* ---------------- DISPLAY RESULTS ---------------- */

function displayResults(places) {

  const results = document.getElementById("results");
  results.innerHTML = "";
  clearMarkers();

  places.forEach(place => {

    const marker = L.marker([place.lat, place.lon]).addTo(map);
    placeMarkers.push(marker);

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <h3>${place.tags.name || "Unnamed Place"}</h3>
      <p>📍 ${place.distance.toFixed(2)} km</p>
      <p>⭐ ${place.rating}</p>
      <p>💰 ${place.approxCost}</p>
      <button class="favorite-btn">❤️ Save</button>
    `;

    card.onclick = () => showPlaceDetails(place);

    card.querySelector(".favorite-btn").onclick = (e) => {
      e.stopPropagation();
      saveFavorite(place);
    };

    results.appendChild(card);
  });
}

/* ---------------- DETAILS PANEL ---------------- */

async function showPlaceDetails(place) {

  const panel = document.getElementById("detailsPanel");
  panel.classList.remove("hidden");

  if(routeLayer) map.removeLayer(routeLayer);

  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${userLon},${userLat};${place.lon},${place.lat}?overview=full&geometries=geojson`;

  const routeRes = await fetch(routeUrl);
  const routeData = await routeRes.json();
  const route = routeData.routes[0];

  routeLayer = L.geoJSON(route.geometry, {
    style: { color: "#4f46e5", weight: 5 }
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds());

  const geoRes = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${place.lat}&lon=${place.lon}`
  );
  const geoData = await geoRes.json();

  panel.innerHTML = `
    <h3>${place.tags.name || "Unnamed Place"}</h3>
    <p>📍 Distance: ${place.distance.toFixed(2)} km</p>
    <p>⭐ Rating: ${place.rating}</p>
    <p>💰 Approx Spend: ${place.approxCost}</p>
    <p>🧠 AI Score: ${place.score.toFixed(0)}</p>
    <p>🏠 Address: ${geoData.display_name || "Not available"}</p>
    <button class="favorite-btn" onclick="closeDetails()">Close</button>
  `;
}

function closeDetails() {
  document.getElementById("detailsPanel").classList.add("hidden");
}

/* ---------------- FAVORITES ---------------- */

function saveFavorite(place) {
  if (!favorites.find(p => p.lat === place.lat)) {
    favorites.push(place);
    localStorage.setItem("favorites", JSON.stringify(favorites));
    loadFavorites();
  }
}

function removeFavorite(lat) {
  favorites = favorites.filter(p => p.lat !== lat);
  localStorage.setItem("favorites", JSON.stringify(favorites));
  loadFavorites();
}

function clearFavorites() {
  favorites = [];
  localStorage.removeItem("favorites");
  loadFavorites();
}

function loadFavorites() {
  const container = document.getElementById("favorites");
  container.innerHTML = "";

  favorites.forEach(place => {

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <h3>${place.tags.name || "Unnamed Place"}</h3>
      <button class="remove-btn">❌ Remove</button>
    `;

    card.querySelector(".remove-btn").onclick = () =>
      removeFavorite(place.lat);

    container.appendChild(card);
  });
}

/* ---------------- HISTORY ---------------- */

function saveHistory(mood, budget) {
  history.unshift({ mood, budget });
  history = history.slice(0,10);
  localStorage.setItem("history", JSON.stringify(history));
  loadHistory();
}

function removeHistory(index) {
  history.splice(index, 1);
  localStorage.setItem("history", JSON.stringify(history));
  loadHistory();
}

function clearHistory() {
  history = [];
  localStorage.removeItem("history");
  loadHistory();
}

function loadHistory() {
  const box = document.getElementById("history");
  box.innerHTML = "";

  history.forEach((item, index) => {

    const div = document.createElement("div");
    div.className = "history-item";

    div.innerHTML = `
      <span>Mood: ${item.mood} | Budget: ${item.budget}</span>
      <button class="remove-btn">❌</button>
    `;

    div.querySelector(".remove-btn").onclick = (e) => {
      e.stopPropagation();
      removeHistory(index);
    };

    div.onclick = () => findPlaces(item.mood, item.budget);

    box.appendChild(div);
  });
}

/* ---------------- AI SCORE ---------------- */

function calculateAIScore(distance, rating, price, budget) {
  let score = 100;
  score -= distance * 5;
  score += rating * 10;

  if (budget === "low" && price === 1) score += 20;
  if (budget === "medium" && price === 2) score += 20;
  if (budget === "high" && price === 3) score += 20;

  return score;
}

function generateApproxCost(level) {
  if(level === 1) return "₹200 - ₹500";
  if(level === 2) return "₹500 - ₹1500";
  return "₹1500 - ₹4000";
}

/* ---------------- HELPERS ---------------- */

function clearMarkers() {
  placeMarkers.forEach(marker => map.removeLayer(marker));
  placeMarkers = [];
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI/180;
  const dLon = (lon2 - lon1) * Math.PI/180;

  const a =
    Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2)*Math.sin(dLon/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
