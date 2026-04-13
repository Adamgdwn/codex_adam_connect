module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['./jest.setup.js'],
  moduleNameMapper: {
    '^@adam-connect/shared$': '<rootDir>/../../packages/shared/dist/index.js',
  },
};
