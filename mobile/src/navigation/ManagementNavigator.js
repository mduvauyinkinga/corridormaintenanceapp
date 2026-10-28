/**
 * navigation/ManagementNavigator.js
 * ------------------------------------------------------------------
 * Bottom tabs for the management role — the mobile counterpart of
 * management.html's four tabs:
 *   Complaints   → #view-complaints (+ complaint details modal)
 *   Residents    → #view-residents
 *   Units        → #view-units (block picker → unit profiles → room profile)
 *   Account      → profile / logout
 *
 * The website exposes these as tabs inside one page; on mobile they become
 * tabs in the bottom bar and their modals become stacked screens.
 */

import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";

import ManagementComplaintsScreen from "../screens/management/ManagementComplaintsScreen";
import ManagementComplaintDetailsScreen from "../screens/management/ManagementComplaintDetailsScreen";
import ResidentsScreen from "../screens/management/ResidentsScreen";
import RoomProfileScreen from "../screens/management/RoomProfileScreen";
import UnitsScreen from "../screens/management/UnitsScreen";
import ProfileScreen from "../screens/shared/ProfileScreen";
import { screenOptions, tabScreenOptions } from "./navTheme";

const Tabs = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ComplaintsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="ComplaintsList"
        component={ManagementComplaintsScreen}
        options={{ title: "Management" }}
      />
      <Stack.Screen
        name="ManageComplaintDetails"
        component={ManagementComplaintDetailsScreen}
        options={{ title: "Complaint Details" }}
      />
    </Stack.Navigator>
  );
}

function UnitsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="UnitBlocks"
        component={UnitsScreen}
        options={{ title: "Unit Profiles" }}
      />
      <Stack.Screen
        name="RoomProfile"
        component={RoomProfileScreen}
        options={{ title: "Room Profile" }}
      />
    </Stack.Navigator>
  );
}

export default function ManagementNavigator() {
  return (
    <Tabs.Navigator screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="Complaints"
        component={ComplaintsStack}
        options={{
          headerShown: false,
          title: "Complaints",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Residents"
        component={ResidentsScreen}
        options={{
          title: "Residents",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="Units"
        component={UnitsStack}
        options={{
          headerShown: false,
          title: "Units",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" color={color} size={size} />
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
