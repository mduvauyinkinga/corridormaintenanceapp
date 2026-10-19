/**
 * navigation/ResidentNavigator.js
 * ------------------------------------------------------------------
 * Bottom tabs for the resident role — the mobile counterpart of the
 * website's resident navbar (js/nav.js NAV_ITEMS.resident:
 * "Dashboard", "Submit Complaint", "Track Complaints" + Logout).
 *
 * Mobile mapping:
 *   Home     → dashboard.html
 *   Report   → complaint.html
 *   Reports  → tracking.html (+ complaint details + edit)
 *   Account  → profile / logout
 */

import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";

import ComplaintDetailsScreen from "../screens/resident/ComplaintDetailsScreen";
import DashboardScreen from "../screens/resident/DashboardScreen";
import EditComplaintScreen from "../screens/resident/EditComplaintScreen";
import MyComplaintsScreen from "../screens/resident/MyComplaintsScreen";
import RulesScreen from "../screens/resident/RulesScreen";
import SubmitComplaintScreen from "../screens/resident/SubmitComplaintScreen";
import ProfileScreen from "../screens/shared/ProfileScreen";
import { colors } from "../theme";
import { screenOptions, tabScreenOptions } from "./navTheme";

const Tabs = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/** Dashboard + a details screen for a complaint opened from a card. */
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={{ title: "Dashboard" }}
      />
      <Stack.Screen
        name="ComplaintDetails"
        component={ComplaintDetailsScreen}
        options={{ title: "Complaint Details" }}
      />
    </Stack.Navigator>
  );
}

/** My complaints + details + edit. */
function ReportsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="MyComplaints"
        component={MyComplaintsScreen}
        options={{ title: "My Complaints" }}
      />
      <Stack.Screen
        name="TrackedComplaintDetails"
        component={ComplaintDetailsScreen}
        options={{ title: "Complaint Details" }}
      />
      <Stack.Screen
        name="EditComplaint"
        component={EditComplaintScreen}
        options={{ title: "Edit Complaint" }}
      />
    </Stack.Navigator>
  );
}

export default function ResidentNavigator() {
  return (
    <Tabs.Navigator screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="Home"
        component={HomeStack}
        options={{
          headerShown: false,
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Report"
        component={SubmitComplaintScreen}
        options={{
          title: "Report",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="create-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Reports"
        component={ReportsStack}
        options={{
          headerShown: false,
          title: "My Reports",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Rules"
        component={RulesScreen}
        options={{
          title: "Rules",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Account"
        component={ProfileScreen}
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}

/** Exported for screens that need the resident accent colour. */
export const residentTabColors = { primary: colors.primary };
