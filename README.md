# Gelug

An alternative to N0isli built with plain HTML, CSS and JavaScript. A website that provides background sounds to help users create a focused and productive environment. It offers a variety of ambient sounds, such as rain, thunderstorm, ocean waves, and more, that users can mix and match according to their preferences. 

The goal is to create a soothing or stimulating atmosphere to enhance concentration, relaxation, or sleep.

## Sounds
Each sound in `assets/sounds` is a loop with a crossfaded seam (90 s for steady sounds, 3 min for the ones with events, like thunder), normalized to the same loudness and played with the Web Audio API so it repeats without a gap. They are generated from the original long recordings. Every sound exists as `.ogg` (Vorbis) and `.m4a` (AAC); Safari, which can't play Ogg, uses the `.m4a`.

## Development
```
npm install
npx playwright install chromium
npm test
```
`npm start` serves the site on http://localhost:4173. Open it through a server (not `file://`) to get gapless loops and offline support.

## TRY IT
https://rubenaraujo.github.io/project_gelug/
