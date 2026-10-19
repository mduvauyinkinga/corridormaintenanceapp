/**
 * config.js (site)
 * ------------------------------------------------------------------
 * Environment configuration for the static website. Loaded as a plain
 * (non-module) script BEFORE the ES modules on every page, so
 * window.__CORRIDOR_API_BASE__ is always defined when js/api.js runs.
 *
 * - Local development (Live Server / python -m http.server) -> localhost API.
 * - Anywhere else (GitHub Pages) -> the production API URL below.
 *
 * ⚠️ EDIT PROD_API_BASE the first time you deploy the API to Render:
 * replace the placeholder with your real Render service URL, e.g.
 *   https://corridor-maintenance-api.onrender.com
 */
(function () {
  var PROD_API_BASE = "https://corridor-maintenance-api.onrender.com";

  var host = window.location.hostname;
  var isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "" || // file:// pages
    host === "[::1]";

  window.__CORRIDOR_API_BASE__ = isLocal ? "http://localhost:4000" : PROD_API_BASE;
})();