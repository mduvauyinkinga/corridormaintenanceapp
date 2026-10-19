/**
 * navigation/RootNavigator.js
 * ------------------------------------------------------------------
 * The mobile equivalent of the website's route guards.
 *
 * Website behaviour (js/auth.js + js/login.js) reproduced here:
 *   not signed in            → login page
 *   signed in, no profile    → choose-room page
 *   resident without a room  → choose-room page
 *   resident with a room     → resident pages (dashboard/complaint/tracking)
 *   management               → management console
 *
 * Because React Navigation renders only the branch that matches the
 * current session, a resident simply has no management screens mounted and
 * vice versa — the same separation the website enforces by redirecting.
 * Firestore Security Rules remain the authoritative boundary for data.
 */

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";

import { AUTH_STATUS, useAuth } from "../context/AuthContext";
import ChooseRoomScreen from "../screens/auth/ChooseRoomScreen";
import LandingScreen from "../screens/auth/LandingScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import ProfileScreen from "../screens/shared/ProfileScreen";
import SplashScreen from "../screens/shared/SplashScreen";
import { navigationTheme, screenOptions } from "./navTheme";
import ManagementNavigator from "./ManagementNavigator";
import ResidentNavigator from "./ResidentNavigator";

const Stack = createNativeStackNavigator();

/** Public (unauthenticated) stack: landing → login → register. */
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Landing"
        component={LandingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Login" }} />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: "Create Account" }}
      />
    </Stack.Navigator>
  );
}

/** Signed in but no profile / no room: the "choose room" setup flow. */
function SetupStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="ChooseRoom"
        component={ChooseRoomScreen}
        options={{ title: "Choose Your Room" }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "My Account" }}
      />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { status, profile } = useAuth();

  if (status === AUTH_STATUS.LOADING) {
    return <SplashScreen />;
  }

  const renderSignedIn = () => {
    if (!profile) return <SetupStack />;
    if (profile.role === "management") return <ManagementNavigator />;
    if (!profile.roomId) return <SetupStack />;
    return <ResidentNavigator />;
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      {status === AUTH_STATUS.SIGNED_OUT ? <AuthStack /> : renderSignedIn()}
    </NavigationContainer>
  );
}
