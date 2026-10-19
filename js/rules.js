/**
 * rules.js
 * ------------------------------------------------------------------
 * House rules page (resident only).
 *
 * Guards the route the same way as the other resident pages, renders
 * the shared navbar (which includes the Rules tab), then reveals the
 * static rules markup in rules.html.
 */

import { requireRole } from "./auth.js";
import { renderNav } from "./nav.js";

async function init() {
  const profile = await requireRole(["resident"]);
  if (!profile) return; // Guard redirected.

  renderNav(profile);
  document.title = `Rules | ${profile.name}`;

  const rulesState = document.querySelector("#rules-state");
  if (rulesState) rulesState.classList.remove("hidden");
}

init();
