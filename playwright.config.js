const { defineConfig } = require("@playwright/test")

module.exports = defineConfig({
  testDir: "tests",
  webServer: {
    command: "python3 -m http.server 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "ignore",
  },
  use: {
    baseURL: "http://localhost:4173",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
})
