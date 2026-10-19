/**
 * config/branding.js
 * ------------------------------------------------------------------
 * Shared branding + static content.
 *
 * These strings come from the website so both clients feel like the same
 * product: index.html (hero/about), dashboard.html (house rules) and the
 * manifest/navbar (app name, logo).
 */

/** App naming (index.html title + manifest.webmanifest short_name). */
export const BRAND = {
  name: "Corridor Hill",
  fullName: "Corridor Hill Residence Maintenance System",
  tagline:
    "Report and track maintenance issues in your room — and let management resolve them quickly.",
  supportEmail: "corridorhill@tut4life.ac.za",
};

/**
 * Logo file. This is a COPY of the website asset
 * (assets/images/corridor-logo.jpeg); the original website file is not
 * moved, renamed or modified.
 */
export const LOGO = require("../../assets/corridor-logo.jpeg");

/** Landing-page feature blurbs (index.html #features). */
export const FEATURES = [
  {
    title: "Submit Complaints",
    body: "Select from common issues like toilet light, stove, leaks, electrical, and more.",
    icon: "create-outline",
  },
  {
    title: "Track Progress",
    body: "Follow your reports from Submitted to In Progress to Completed.",
    icon: "pulse-outline",
  },
  {
    title: "Room Management",
    body: "Residents choose their own block, room, and available unit.",
    icon: "home-outline",
  },
  {
    title: "Management Console",
    body: "A dedicated dashboard to view all complaints and residents.",
    icon: "speedometer-outline",
  },
  {
    title: "Secure Access",
    body: "Authentication with university email verification and role-based access.",
    icon: "lock-closed-outline",
  },
  {
    title: "Fast & Simple",
    body: "Built with a modern, lightweight tech stack — no heavy dependencies.",
    icon: "flash-outline",
  },
];

/** House rules shown on the Rules page (rules.html + mobile Rules tab). */
export const HOUSE_RULES = [
  {
    title: "Keep the fridge clean",
    body: "Clean and defrost your fridge regularly. Never leave food to spoil.",
  },
  {
    title: "Respect quiet hours",
    body: "Keep noise to a minimum between 22:00 and 06:00 for your neighbours.",
  },
  {
    title: "Dispose of waste properly",
    body: "Use the designated bins and separate recyclables from general waste.",
  },
  {
    title: "Secure your room",
    body: "Always lock your door and keep your key card safe. Report lost keys immediately.",
  },
  {
    title: "Energy saving",
    body: "Switch off lights, heaters and appliances when not in use.",
  },
  {
    title: "Be a good neighbour",
    body: "Keep shared spaces tidy and treat everyone with respect.",
  },
];
