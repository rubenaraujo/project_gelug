const FADE = 0.05
const MAX_TIMER_MINUTES = 15

const STRINGS = {
  en: {
    install: "Install", installTitle: "Install app",
    wakelock: "Keep screen on", wakelockTitle: "Keep the screen on while sounds are playing",
    timer: "Sleep timer", timerTitle: "Fade the sounds out to mute", timerHint: "Fades out slowly, then mutes",
    min: "min", minutes: "Minutes", start: "Start", cancel: "Cancel",
    mute: "Mute", unmute: "Unmute", muteTitle: "Mute/Unmute",
    langTitle: "Mudar para Português", lang: "PT", volume: name => `${name} volume`,
    credit: "developed by Ruben Araujo",
    description: "Mix ambient sounds such as rain, thunderstorm, ocean waves and white noise to focus, relax and sleep.",
  },
  pt: {
    install: "Instalar", installTitle: "Instalar app",
    wakelock: "Manter ecrã ligado", wakelockTitle: "Manter o ecrã ligado enquanto os sons tocam",
    timer: "Temporizador", timerTitle: "Reduzir o volume aos poucos até ao mute", timerHint: "Baixa o volume lentamente e depois silencia",
    min: "min", minutes: "Minutos", start: "Iniciar", cancel: "Cancelar",
    mute: "Silenciar", unmute: "Ativar som", muteTitle: "Silenciar/Ativar som",
    langTitle: "Switch to English", lang: "EN", volume: name => `Volume de ${name}`,
    credit: "desenvolvido por Ruben Araujo",
    description: "Mistura sons ambiente como chuva, trovoada, ondas do mar e ruído branco para te concentrares, relaxares e dormires.",
  },
}

const SOUND_NAMES_PT = {
  rain: "Chuva", thunderstorm: "Trovoada", wind: "Vento", forest: "Floresta", leaves: "Folhas",
  waterstream: "Riacho", seaside: "Praia", water: "Água", fire: "Lareira", summernight: "Noite de verão",
  coffee: "Café", train: "Comboio", fan: "Ventoinha", washingmachine: "Máquina de lavar", garden: "Jardim",
  underwater: "Debaixo de água", spaceship: "Nave espacial", waterfall: "Cascata", car: "Carro",
  airplane: "Avião", whitenoise: "Ruído branco", pinknoise: "Ruído rosa", brownnoise: "Ruído castanho",
}

const savedLanguage = (() => { try { return localStorage.getItem("gelug-language") } catch (error) { return null } })()
let language = savedLanguage in STRINGS ? savedLanguage : (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en"
const t = key => STRINGS[language][key]


// Safari has no Ogg Vorbis support, so it gets the AAC copies of the sounds
const SOUND_EXTENSION = document.createElement("audio").canPlayType('audio/ogg; codecs="vorbis"') ? "ogg" : "m4a"
const soundUrl = key => `assets/sounds/${key}.${SOUND_EXTENSION}`

// On iOS, Web Audio is silenced by the ringer switch unless the page declares it is playing media
if (navigator.audioSession) navigator.audioSession.type = "playback"

let context
let master
let muted = false
let paused = false
let fadeLevel = 1 // 1 = full volume; lowered by the sleep timer
const rawData = new Map() // key -> Promise<ArrayBuffer>
const buffers = new Map() // key -> Promise<AudioBuffer>
const voices = new Map() // key -> voice for sounds that are on (null while loading)

function getContext() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)()
    master = context.createGain()
    master.gain.value = muted ? 0 : fadeLevel
    master.connect(context.destination)
  }
  if (context.state === "suspended" && !paused) context.resume()
  return context
}

function fetchData(key) {
  if (!rawData.has(key)) {
    const promise = fetch(soundUrl(key)).then(response => {
      if (!response.ok) throw new Error(response.statusText)
      return response.arrayBuffer()
    })
    promise.catch(() => rawData.delete(key))
    rawData.set(key, promise)
  }
  return rawData.get(key)
}

function loadBuffer(key) {
  if (!buffers.has(key)) {
    const promise = fetchData(key).then(data => getContext().decodeAudioData(data))
    promise.catch(() => {
      buffers.delete(key)
      rawData.delete(key)
    })
    buffers.set(key, promise)
  }
  return buffers.get(key)
}

function setVoiceVolume(voice, slider) {
  const volume = slider.value / slider.max
  if (voice.audio)
    voice.audio.volume = volume * fadeLevel
  else
    voice.gain.gain.setTargetAtTime(volume, context.currentTime, FADE)
}

// Slowly drifts volume and pitch a little so the loop feels less repetitive
function wobble(voice) {
  voice.timer = setTimeout(() => {
    const now = context.currentTime
    voice.variation.gain.setTargetAtTime(0.85 + Math.random() * 0.15, now, 2)
    voice.source.detune.setTargetAtTime((Math.random() - 0.5) * 30, now, 3)
    wobble(voice)
  }, 4000 + Math.random() * 6000)
}

// Plain <audio> playback, used when the sound can't be fetched/decoded (e.g. opening the page from file://)
function startFallbackVoice(key, slider) {
  const audio = new Audio(soundUrl(key))
  audio.loop = true
  audio.muted = muted
  const voice = { audio, slider }
  voices.set(key, voice)
  setVoiceVolume(voice, slider)
  audio.play().catch(error => console.error(`Could not play "${key}"`, error))
}

async function startSound(key, image, slider) {
  image.classList.add("active", "loading")
  image.setAttribute("aria-pressed", "true")
  slider.classList.add("slider-active")
  voices.set(key, null) // reserve the slot while the sound loads
  if (paused) setPlaying(true)
  syncState()

  try {
    getContext()
    const buffer = await loadBuffer(key)
    // The user may have turned the sound off while it was loading
    if (voices.get(key) !== null) return

    const gain = context.createGain()
    gain.gain.value = 0
    const variation = context.createGain()
    gain.connect(variation)
    variation.connect(master)

    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(gain)
    source.start()

    const voice = { source, gain, variation, timer: null }
    voices.set(key, voice)
    setVoiceVolume(voice, slider)
    wobble(voice)
  } catch (error) {
    console.error(`Web Audio failed for "${key}", falling back to <audio>`, error)
    if (voices.get(key) === null)
      startFallbackVoice(key, slider)
  } finally {
    image.classList.remove("loading")
  }
}

function stopSound(key, image, slider) {
  const voice = voices.get(key)
  voices.delete(key)
  image.classList.remove("active", "loading")
  image.setAttribute("aria-pressed", "false")
  slider.classList.remove("slider-active")

  if (voice?.audio) {
    voice.audio.pause()
  } else if (voice) {
    clearTimeout(voice.timer)
    voice.gain.gain.setTargetAtTime(0, context.currentTime, FADE)
    voice.source.stop(context.currentTime + FADE * 6)
  }
  syncState()
}

function toggleSound(image) {
  const key = image.parentElement.dataset.key
  const slider = image.parentElement.querySelector(`input[type="range"]`)

  if (voices.has(key))
    stopSound(key, image, slider)
  else
    startSound(key, image, slider)
}

function setMuted(value) {
  muted = value
  const buttonMute = document.querySelector("#btn-mute")
  buttonMute.classList.toggle("fa-volume-up", !muted)
  buttonMute.classList.toggle("fa-volume-off", muted)
  buttonMute.classList.toggle("active", !muted)
  buttonMute.setAttribute("aria-label", muted ? t("unmute") : t("mute"))

  if (master)
    master.gain.setTargetAtTime(muted ? 0 : fadeLevel, context.currentTime, FADE)
  voices.forEach(voice => {
    if (voice?.audio) voice.audio.muted = muted
  })
}

function setPlaying(playing) {
  paused = !playing
  document.body.classList.toggle("paused", paused)
  if (context) playing ? context.resume() : context.suspend()
  voices.forEach(voice => {
    if (voice?.audio) playing ? voice.audio.play() : voice.audio.pause()
  })
  syncState()
}

const BLUE = [40, 90, 160], PURPLE = [90, 70, 170], AMBER = [190, 90, 30], GREEN = [40, 130, 80]
const SLATE = [85, 105, 125], STEEL = [110, 115, 125], INDIGO = [50, 55, 150]
const AMBIENT_COLORS = {
  rain: BLUE, waterstream: BLUE, seaside: BLUE, water: BLUE, underwater: BLUE, waterfall: BLUE,
  thunderstorm: PURPLE,
  fire: AMBER, coffee: AMBER,
  forest: GREEN, leaves: GREEN, garden: GREEN, summernight: GREEN,
  wind: SLATE, fan: SLATE, washingmachine: SLATE, whitenoise: SLATE, pinknoise: SLATE, brownnoise: SLATE,
  train: STEEL, car: STEEL, airplane: STEEL,
  spaceship: INDIGO,
}

// Tints the background with the colors of the active sounds, weighted by their volume
function updateAmbient() {
  const total = [0, 0, 0]
  let weight = 0
  let strongest = 0
  document.querySelectorAll("#sound-types > div").forEach(tile => {
    const color = AMBIENT_COLORS[tile.dataset.key]
    const slider = tile.querySelector(`input[type="range"]`)
    if (!color || !voices.has(tile.dataset.key)) return
    const volume = slider.value / slider.max
    color.forEach((channel, i) => { total[i] += channel * volume })
    weight += volume
    strongest = Math.max(strongest, volume)
  })

  const style = document.documentElement.style
  if (weight > 0) total.forEach((sum, i) => style.setProperty(`--glow-${"rgb"[i]}`, Math.round(sum / weight)))
  style.setProperty("--glow-a", (0.15 + 0.3 * strongest) * (weight > 0 ? 1 : 0))
}

// Keeps the tab title, wake lock and media session in sync with what is playing
function syncState() {
  renderTitle()
  updateAmbient()
  updateWakeLock()
  if ("mediaSession" in navigator)
    navigator.mediaSession.playbackState = voices.size && !paused ? "playing" : "paused"
}

// Off by default: keeping the screen awake all night drains the battery
let keepScreenOn = false
let wakeLock = null
async function updateWakeLock() {
  const wanted = keepScreenOn && voices.size > 0 && !paused && document.visibilityState === "visible"

  if (wanted && !wakeLock && "wakeLock" in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request("screen")
      wakeLock.addEventListener("release", () => { wakeLock = null })
    } catch (error) {
      // Wake lock can be refused (e.g. low battery); playback is unaffected
    }
  } else if (!wanted && wakeLock) {
    wakeLock.release()
    wakeLock = null
  }
}

function setWakeLockButton() {
  const button = document.querySelector("#btn-wakelock")
  if (!("wakeLock" in navigator)) return

  button.hidden = false
  button.addEventListener("click", () => {
    keepScreenOn = !keepScreenOn
    button.classList.toggle("active", keepScreenOn)
    button.setAttribute("aria-pressed", String(keepScreenOn))
    updateWakeLock()
  })
}

function setMediaSession() {
  if (!("mediaSession" in navigator)) return

  navigator.mediaSession.metadata = new MediaMetadata({
    title: "Gelug",
    artist: "Ambient sounds",
    artwork: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  })
  navigator.mediaSession.setActionHandler("play", () => setPlaying(true))
  navigator.mediaSession.setActionHandler("pause", () => setPlaying(false))
}

const sleepTimer = { endsAt: 0, duration: 0, interval: null }

function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0")
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}

function timerLabel() {
  return formatTime(Math.max(0, Math.ceil((sleepTimer.endsAt - Date.now()) / 1000)))
}

function renderTitle() {
  const sounds = voices.size ? ` · ${voices.size}` : ""
  document.title = sleepTimer.interval ? `${timerLabel()} · Gelug${sounds}` : `Gelug${sounds}`
}

function setFadeLevel(level) {
  fadeLevel = level
  if (master && !muted) master.gain.setTargetAtTime(level, context.currentTime, 0.5)
  voices.forEach(voice => {
    if (voice?.audio) setVoiceVolume(voice, voice.slider)
  })
}

const soundNames = {} // key -> { en, pt }

function applyLanguage() {
  document.documentElement.lang = language
  document.querySelectorAll("[data-i18n]").forEach(element => { element.textContent = t(element.dataset.i18n) })
  document.querySelectorAll("[data-i18n-title]").forEach(element => { element.title = t(element.dataset.i18nTitle) })
  document.querySelectorAll("[data-i18n-aria]").forEach(element => { element.setAttribute("aria-label", t(element.dataset.i18nAria)) })
  document.querySelector('meta[name="description"]').content = t("description")

  const buttonLang = document.querySelector("#btn-lang")
  buttonLang.textContent = t("lang")
  buttonLang.setAttribute("aria-label", t("langTitle"))
  document.querySelector("#btn-mute").title = t("muteTitle")

  document.querySelectorAll("#sound-types > div").forEach(tile => {
    const name = soundNames[tile.dataset.key]?.[language]
    if (!name) return
    const image = tile.querySelector("img")
    image.alt = image.title = name
    image.setAttribute("aria-label", name)
    tile.querySelector(`input[type="range"]`).setAttribute("aria-label", t("volume")(name))
  })

  setMuted(muted)
  if (sleepTimer.interval) document.querySelector("#btn-timer-label").textContent = timerLabel()
  renderTimerPanel()
}

function renderTimerPanel() {
  const running = Boolean(sleepTimer.interval)
  const input = document.querySelector("#timer-minutes")
  document.querySelector("#timer-value").textContent = running ? timerLabel() : input.value
  document.querySelector("#timer-unit").hidden = running
  document.querySelector("#btn-timer-start").textContent = running ? t("cancel") : t("start")
  document.querySelector("#timer-panel").classList.toggle("running", running)
  input.disabled = running
  input.style.setProperty("--fill", `${((input.value - input.min) / (input.max - input.min)) * 100}%`)
  document.querySelectorAll(".timer-presets button").forEach(button => {
    button.disabled = running
    button.classList.toggle("selected", button.dataset.minutes === input.value)
  })
}

function setTimerPanelOpen(open) {
  document.querySelector("#timer-panel").hidden = !open
  document.querySelector("#btn-timer").setAttribute("aria-expanded", String(open))
}

function stopSleepTimer() {
  clearInterval(sleepTimer.interval)
  sleepTimer.interval = null
  const button = document.querySelector("#btn-timer")
  document.querySelector("#btn-timer-label").textContent = t("timer")
  button.classList.remove("active")
  button.style.removeProperty("--progress")
  renderTimerPanel()
  renderTitle()
}

function tickSleepTimer() {
  const remaining = sleepTimer.endsAt - Date.now()
  if (remaining <= 0) {
    stopSleepTimer()
    setMuted(true)
    setFadeLevel(1) // restored so unmuting brings the sounds back at their normal volume
    return
  }
  setFadeLevel(remaining / sleepTimer.duration)
  document.querySelector("#btn-timer-label").textContent = timerLabel()
  document.querySelector("#btn-timer").style.setProperty("--progress", `${(remaining / sleepTimer.duration) * 100}%`)
  renderTimerPanel()
  renderTitle()
}

function startSleepTimer() {
  const minutes = Math.min(MAX_TIMER_MINUTES, Math.max(1, Math.round(Number(document.querySelector("#timer-minutes").value)) || 1))
  getContext() // created on a user gesture so the fade can run
  sleepTimer.duration = minutes * 60 * 1000
  sleepTimer.endsAt = Date.now() + sleepTimer.duration
  document.querySelector("#btn-timer").classList.add("active")
  sleepTimer.interval = setInterval(tickSleepTimer, 1000)
  tickSleepTimer()
  setTimerPanelOpen(false)
}

function setSleepTimer() {
  const input = document.querySelector("#timer-minutes")
  const panel = document.querySelector("#timer-panel")

  document.querySelector("#btn-timer").addEventListener("click", () => setTimerPanelOpen(panel.hidden))
  input.addEventListener("input", renderTimerPanel)
  document.querySelectorAll(".timer-presets button").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.minutes
      renderTimerPanel()
    })
  })
  document.querySelector("#btn-timer-start").addEventListener("click", () => {
    if (sleepTimer.interval) {
      stopSleepTimer()
      setFadeLevel(1)
    } else {
      startSleepTimer()
    }
  })
  document.addEventListener("click", event => {
    if (!panel.hidden && !event.target.closest("#timer")) setTimerPanelOpen(false)
  })
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) {
      setTimerPanelOpen(false)
      document.querySelector("#btn-timer").focus()
    }
  })
  renderTimerPanel()
}

function setInstallButton() {
  const button = document.querySelector("#btn-install")
  let installPrompt

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault()
    installPrompt = event
    button.hidden = false
  })
  window.addEventListener("appinstalled", () => {
    button.hidden = true
  })
  button.addEventListener("click", async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice
    installPrompt = null
    button.hidden = true
  })
}

// Moves focus to the sound icon nearest to the current one in the pressed direction
function moveFocus(images, current, key) {
  if (!current) return images[0].focus()

  const index = images.indexOf(current)
  if (key === "ArrowRight") return images[Math.min(index + 1, images.length - 1)].focus()
  if (key === "ArrowLeft") return images[Math.max(index - 1, 0)].focus()

  const rect = current.getBoundingClientRect()
  const direction = key === "ArrowDown" ? 1 : -1
  const candidates = images
    .map(image => ({ image, rect: image.getBoundingClientRect() }))
    .filter(({ rect: other }) => (other.top - rect.top) * direction > rect.height / 2)
    .sort((a, b) =>
      Math.abs(a.rect.top - rect.top) - Math.abs(b.rect.top - rect.top) ||
      Math.abs(a.rect.left - rect.left) - Math.abs(b.rect.left - rect.left))
  if (candidates.length) candidates[0].image.focus()
}

function setKeyboardEvents(images) {
  document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const target = event.target
    if (target.matches(`input[type="range"]`)) return
    const onSound = images.includes(target)

    if ((event.key === " " || event.key === "Enter") && onSound) {
      event.preventDefault()
      toggleSound(target)
    } else if (event.key === " " && !target.matches("button")) {
      event.preventDefault()
      if (voices.size) setPlaying(paused)
    } else if (event.key.toLowerCase() === "m" && !target.matches("button")) {
      setMuted(!muted)
    } else if (event.key.startsWith("Arrow") && (onSound || target === document.body)) {
      event.preventDefault()
      moveFocus(images, onSound ? target : null, event.key)
    }
  })
}

function setButtonEvents() {
  const buttons = document.querySelectorAll("#buttons > button")
  const images = [...document.querySelectorAll("#sound-types img")]
  const sliders = document.querySelectorAll(`input[type="range"]`)

  buttons.forEach(button => {
    button.addEventListener("click", event => {
      button.classList.toggle("active")
    })
  })

  images.forEach((image, index) => {
    const key = image.parentElement.dataset.key
    const slider = image.parentElement.querySelector(`input[type="range"]`)

    image.setAttribute("role", "button")
    image.setAttribute("aria-pressed", "false")
    soundNames[key] = { en: image.alt, pt: SOUND_NAMES_PT[key] || image.alt }
    image.tabIndex = index === 0 ? 0 : -1

    // Roving tabindex: a single tab stop for the grid, arrows move inside it
    image.addEventListener("focus", () => {
      images.forEach(other => { other.tabIndex = other === image ? 0 : -1 })
    })
    image.addEventListener("click", () => toggleSound(image))
    // Start downloading on hover so the sound is ready by the time it is clicked
    image.addEventListener("pointerenter", event => {
      if (event.pointerType === "mouse") fetchData(key).catch(() => {})
    })
  })

  sliders.forEach(slider => {
    slider.addEventListener("input", event => {
      const key = slider.parentElement.dataset.key
      slider.style.setProperty("--fill", `${(slider.value / slider.max) * 100}%`)

      const voice = voices.get(key)
      if (voice)
        setVoiceVolume(voice, slider)
      updateAmbient()
    })
  })

  document.querySelector("#btn-mute").addEventListener("click", () => setMuted(!muted))
  setSleepTimer()
  setKeyboardEvents(images)

  document.querySelector("#btn-lang").addEventListener("click", () => {
    language = language === "en" ? "pt" : "en"
    try { localStorage.setItem("gelug-language", language) } catch (error) { /* private mode */ }
    applyLanguage()
  })
  applyLanguage()
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http"))
    navigator.serviceWorker.register("service-worker.js").catch(error => console.error("Service worker failed", error))
}

function run() {
  setButtonEvents()
  setInstallButton()
  setWakeLockButton()
  setMediaSession()
  registerServiceWorker()
  document.addEventListener("visibilitychange", updateWakeLock)
}

run()
