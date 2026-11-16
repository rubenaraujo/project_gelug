const { test, expect } = require("@playwright/test")

const sound = (page, name) => page.locator(`img[alt="${name}"]`)
const playing = page => page.evaluate(() => [...voices.keys()])
const loaded = (page, count) =>
  page.waitForFunction(n => voices.size === n && [...voices.values()].every(Boolean), count)

test.beforeEach(async ({ page }) => {
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  page.errors = errors
  await page.goto("/")
})

test.afterEach(({ page }) => {
  expect(page.errors).toEqual([])
})

test("shows every sound", async ({ page }) => {
  await expect(page.locator("#sound-types img")).toHaveCount(23)
})

test("clicking a sound plays it in a loop and clicking again stops it", async ({ page }) => {
  await sound(page, "Rain").click()
  await loaded(page, 1)
  expect(await page.evaluate(() => voices.get("rain").source.loop)).toBe(true)
  await expect(sound(page, "Rain")).toHaveAttribute("aria-pressed", "true")

  await sound(page, "Rain").click()
  expect(await playing(page)).toEqual([])
  await expect(sound(page, "Rain")).toHaveAttribute("aria-pressed", "false")
})

test("turning a sound off while it loads leaves nothing playing", async ({ page }) => {
  await sound(page, "Fire").click()
  await sound(page, "Fire").click()
  await page.waitForTimeout(1500)
  expect(await playing(page)).toEqual([])
})

test("slider shows the volume and is only visible for active sounds", async ({ page }) => {
  const slider = page.locator('div[data-key="wind"] input')
  await expect(slider).toBeHidden()
  await sound(page, "Wind").click()
  await expect(slider).toBeVisible()

  await slider.fill("20")
  expect(await slider.evaluate(el => el.style.getPropertyValue("--fill"))).toBe("20%")
})

test("mute button toggles", async ({ page }) => {
  await page.click("#btn-mute")
  await expect(page.locator("#btn-mute")).toHaveClass(/fa-volume-off/)
  await page.click("#btn-mute")
  await expect(page.locator("#btn-mute")).toHaveClass(/fa-volume-up/)
})

test("keyboard: Enter toggles, arrows move, Space pauses, M mutes", async ({ page }) => {
  await sound(page, "Rain").focus()
  await page.keyboard.press("Enter")
  await loaded(page, 1)

  await page.keyboard.press("ArrowRight")
  await expect(sound(page, "Thunderstorm")).toBeFocused()
  await page.keyboard.press("ArrowLeft")
  await expect(sound(page, "Rain")).toBeFocused()

  await page.locator("body").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("Space")
  await expect(page.locator("body")).toHaveClass(/paused/)
  expect(await page.evaluate(() => context.state)).toBe("suspended")
  await page.keyboard.press("Space")
  await expect(page.locator("body")).not.toHaveClass(/paused/)

  await page.keyboard.press("m")
  await expect(page.locator("#btn-mute")).toHaveClass(/fa-volume-off/)
})

test("tab title shows how many sounds are playing", async ({ page }) => {
  await sound(page, "Rain").click()
  await sound(page, "Wind").click()
  await expect(page).toHaveTitle("Gelug · 2")
  await sound(page, "Rain").click()
  await sound(page, "Wind").click()
  await expect(page).toHaveTitle("Gelug")
})

test("pomodoro starts and stops", async ({ page }) => {
  await page.click("#btn-pomodoro")
  await expect(page.locator("#btn-pomodoro")).toHaveText(/Focus 2[45]:\d\d/)
  await page.click("#btn-pomodoro")
  await expect(page.locator("#btn-pomodoro")).toHaveText("Pomodoro")
})

test("keep screen on button requests a wake lock only while sounds play", async ({ page }) => {
  await page.addInitScript(() => {
    window.wakeLockRequests = 0
    window.wakeLockReleases = 0
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: async () => {
          window.wakeLockRequests++
          return { addEventListener() {}, release: () => { window.wakeLockReleases++ } }
        },
      },
    })
  })
  await page.reload()

  await page.click("#btn-wakelock")
  await expect(page.locator("#btn-wakelock")).toHaveAttribute("aria-pressed", "true")
  expect(await page.evaluate(() => wakeLockRequests)).toBe(0)

  await sound(page, "Rain").click()
  await expect.poll(() => page.evaluate(() => wakeLockRequests)).toBe(1)
  await sound(page, "Rain").click()
  await expect.poll(() => page.evaluate(() => wakeLockReleases)).toBe(1)
})

test("browsers without Ogg support get the AAC sounds", async ({ page }) => {
  await page.addInitScript(() => {
    const canPlayType = HTMLMediaElement.prototype.canPlayType
    HTMLMediaElement.prototype.canPlayType = function (type) {
      return type.includes("ogg") ? "" : canPlayType.call(this, type)
    }
  })
  await page.reload()

  const request = page.waitForRequest(/assets\/sounds\/rain\.m4a/)
  await sound(page, "Rain").click()
  await request
})

test("registers a service worker and works offline", async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await sound(page, "Rain").click()
  await loaded(page, 1)

  await context.setOffline(true)
  await page.reload()
  await sound(page, "Rain").click()
  await loaded(page, 1)
})
