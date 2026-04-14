/* global jest */

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaProvider: ({children}) => children,
    SafeAreaView: ({children}) => children,
    useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => undefined),
  resetGenericPassword: jest.fn(async () => undefined),
}));

jest.mock('expo-speech-recognition', () => {
  const listeners = new Map();

  return {
    ExpoSpeechRecognitionModule: {
      addListener: jest.fn((eventName, handler) => {
        listeners.set(eventName, handler);
        return {
          remove: jest.fn(() => listeners.delete(eventName)),
        };
      }),
      requestPermissionsAsync: jest.fn(async () => ({granted: true})),
      isRecognitionAvailable: jest.fn(() => true),
      getSpeechRecognitionServices: jest.fn(() => ['com.google.android.tts']),
      getDefaultRecognitionService: jest.fn(() => ({packageName: 'com.google.android.tts'})),
      start: jest.fn(() => undefined),
      stop: jest.fn(() => undefined),
      abort: jest.fn(() => undefined),
    },
  };
});

jest.mock('react-native-tts', () => ({
  default: {
    getInitStatus: jest.fn(async () => 'success'),
    engines: jest.fn(async () => [
      {name: 'default-engine', label: 'Default Engine', default: true, icon: 0},
    ]),
    voices: jest.fn(async () => [
      {
        id: 'en-us-standard',
        name: 'English US Standard',
        language: 'en-US',
        quality: 300,
        latency: 100,
        networkConnectionRequired: false,
        notInstalled: false,
      },
      {
        id: 'en-gb-enhanced',
        name: 'English UK Enhanced',
        language: 'en-GB',
        quality: 500,
        latency: 80,
        networkConnectionRequired: false,
        notInstalled: false,
      },
    ]),
    setDefaultEngine: jest.fn(async () => true),
    setDefaultVoice: jest.fn(async () => 'success'),
    setDefaultLanguage: jest.fn(async () => 'success'),
    setDefaultRate: jest.fn(async () => 'success'),
    setDucking: jest.fn(async () => 'success'),
    speak: jest.fn(),
    stop: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}));

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(async () => [
    {
      identifier: 'expo-en-us',
      name: 'English US',
      language: 'en-US',
      quality: 'Enhanced',
    },
  ]),
}));

jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {
    IOS: {MICROPHONE: 'ios.microphone', SPEECH_RECOGNITION: 'ios.speech'},
    ANDROID: {RECORD_AUDIO: 'android.record_audio'},
  },
  RESULTS: {GRANTED: 'granted'},
  checkMultiple: jest.fn(async permissions =>
    Object.fromEntries(permissions.map(permission => [permission, 'granted'])),
  ),
  requestMultiple: jest.fn(async permissions =>
    Object.fromEntries(permissions.map(permission => [permission, 'granted'])),
  ),
}));
