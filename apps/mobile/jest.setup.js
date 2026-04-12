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

jest.mock('@react-native-voice/voice', () => ({
  default: {
    onSpeechError: null,
    onSpeechResults: null,
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    destroy: jest.fn(async () => undefined),
  },
}));

jest.mock('react-native-tts', () => ({
  default: {
    speak: jest.fn(),
    stop: jest.fn(),
  },
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
