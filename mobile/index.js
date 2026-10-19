/**
 * index.js
 * ------------------------------------------------------------------
 * React Native entry point for the Corridor Hill mobile client.
 *
 * `react-native-get-random-values` MUST be imported first: some crypto
 * helpers used by the networking/auth stack rely on `crypto.getRandomValues`,
 * which is not available in React Native's JavaScript runtime by default.
 */

import "react-native-get-random-values";

import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
