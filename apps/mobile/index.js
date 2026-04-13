/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { FcmService } from './src/services/notifications/fcmService';

new FcmService().installBackgroundHandler();

AppRegistry.registerComponent(appName, () => App);
