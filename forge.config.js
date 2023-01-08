module.exports = {
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "blerch-dev",
          name: "chat-speaker"
        },
        authToken: process.env.ACCESS_TOKEN,
        prerelease: true
      }
    }
  ]
};
