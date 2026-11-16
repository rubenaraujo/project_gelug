const FADE = 0.05

let context
let master
let muted = false
const buffers = new Map() // key -> Promise<AudioBuffer>
const voices = new Map() // key -> { source, gain } for sounds that are on

function getContext() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)()
    master = context.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(context.destination)
  }
  if (context.state === "suspended") context.resume()
  return context
}

function loadBuffer(key) {
  if (!buffers.has(key)) {
    const promise = fetch(`assets/sounds/${key}.ogg`)
      .then(response => {
        if (!response.ok) throw new Error(response.statusText)
        return response.arrayBuffer()
      })
      .then(data => getContext().decodeAudioData(data))
    promise.catch(() => buffers.delete(key))
    buffers.set(key, promise)
  }
  return buffers.get(key)
}

function setVoiceVolume(voice, slider) {
  voice.gain.gain.setTargetAtTime(slider.value / slider.max, context.currentTime, FADE)
}

async function startSound(key, image, slider) {
  getContext()
  image.classList.add("active")
  slider.classList.add("slider-active")
  voices.set(key, null) // reserve the slot while the sound loads

  try {
    const buffer = await loadBuffer(key)
    // The user may have turned the sound off while it was loading
    if (voices.get(key) !== null) return

    const gain = context.createGain()
    gain.gain.value = 0
    gain.connect(master)

    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(gain)
    source.start()

    const voice = { source, gain }
    voices.set(key, voice)
    setVoiceVolume(voice, slider)
  } catch (error) {
    voices.delete(key)
    image.classList.remove("active")
    slider.classList.remove("slider-active")
  }
}

function stopSound(key, image, slider) {
  const voice = voices.get(key)
  voices.delete(key)
  image.classList.remove("active")
  slider.classList.remove("slider-active")

  if (voice) {
    voice.gain.gain.setTargetAtTime(0, context.currentTime, FADE)
    voice.source.stop(context.currentTime + FADE * 6)
  }
}

function setButtonEvents() {
  const buttons = document.querySelectorAll("#buttons > button")
  const images = document.querySelectorAll("img")
  const sliders = document.querySelectorAll(`input[type="range"]`)
  const buttonMute = document.querySelector("#btn-mute")

  buttons.forEach(button => {
    button.addEventListener("click", event => {
      button.classList.toggle("active")
    })
  })

  images.forEach(image => {
    image.addEventListener("click", event => {
      const key = image.parentElement.dataset.key
      if (!key) return

      const slider = document.querySelector(`div[data-key="${key}"] > input[type="range"]`)
      slider.setAttribute("aria-label", `${image.alt} volume`)

      if (voices.has(key))
        stopSound(key, image, slider)
      else
        startSound(key, image, slider)
    })
  })

  sliders.forEach(slider => {
    slider.addEventListener("input", event => {
      const key = slider.parentElement.dataset.key

      const voice = voices.get(key)
      if (voice)
        setVoiceVolume(voice, slider)
    })
  })

  buttonMute.addEventListener("click", event => {
    buttonMute.classList.toggle("fa-volume-up")
    buttonMute.classList.toggle("fa-volume-off")

    muted = !muted
    if (master)
      master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, FADE)
  })
}

function run() {
  setButtonEvents()
}

run()
