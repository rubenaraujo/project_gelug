// Bump the version when the app shell changes so old caches are discarded
const CACHE = "gelug-v6"

const SHELL = [
  "./",
  "index.html",
  "assets/css/gelug.css",
  "assets/js/gelug.js",
  "assets/fonts/raleway-latin.woff2",
  "assets/fonts/barlow-condensed-latin.woff2",
  "assets/fonts/fontawesome-webfont.woff2",
  "assets/mark.png",
  "icon-192.png",
  "icon-512.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  ...[
    "airplane.svg", "brownnoise.png", "car.svg", "coffee.png", "fan.png", "fire.png",
    "forest.png", "garden.svg", "leaves.png", "pinknoise.png", "rain.png", "seaside.png",
    "spaceship.svg", "summernight.png", "thunderstorm.png", "train.png", "underwater.svg",
    "washingmachine.svg", "water.png", "waterfall.svg", "waterstream.png", "whitenoise.png",
    "wind.png",
  ].map(name => `assets/images/${name}`),
]

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", event => {
  const { request } = event
  // Range requests (media elements) can't be answered from a full cached response
  if (request.method !== "GET" || request.headers.has("range")) return

  const url = new URL(request.url)
  const isSound = url.origin === location.origin && url.pathname.includes("/assets/sounds/")

  event.respondWith(isSound ? cacheFirst(request) : staleWhileRevalidate(request))
})

// Sounds are large and never change, so they are cached the first time they are played
async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(response => {
      if (response.ok || response.type === "opaque") cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)

  return cached || network
}
