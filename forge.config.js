module.exports = {
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'blerch-dev',
          name: 'chat-speaker',
        },
        prerelease: true,
      },
    }
  ]
};
