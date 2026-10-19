/**
 * nav.js
 * ------------------------------------------------------------------
 * Shared navigation component. Injects a responsive top navbar into
 * any page that includes a <div data-nav></div> placeholder.
 *
 * The navbar is rendered client-side so it stays consistent across
 * all pages without duplicating markup.
 */

import { logout } from "./auth.js";

const NAV_ITEMS = {
  resident: [
    { label: "Dashboard", href: "dashboard.html" },
    { label: "Submit Complaint", href: "complaint.html" },
    { label: "Track Complaints", href: "tracking.html" },
    { label: "Rules", href: "rules.html" },
  ],
  management: [
    { label: "Management", href: "management.html" },
  ],
};

/**
 * Render the navbar into the [data-nav] container.
 * @param {object} profile - The current user's Firestore profile.
 */
export function renderNav(profile) {
  const mount = document.querySelector("[data-nav]");
  if (!mount) return;

  const role = profile?.role;
  const items = role === "management" ? NAV_ITEMS.management : NAV_ITEMS.resident;

  const nav = document.createElement("nav");
  nav.className = "navbar";
  nav.setAttribute("aria-label", "Main navigation");

  const brand = document.createElement("a");
  brand.className = "navbar__brand";
  brand.href = role === "management" ? "management.html" : "dashboard.html";

  const logo = document.createElement("img");
  logo.className = "navbar__logo";
  logo.src = "assets/images/corridor-logo.jpeg";
  logo.alt = "Corridor Hill logo";
  logo.width = 40;
  logo.height = 40;

  brand.appendChild(logo);
  brand.appendChild(document.createTextNode("Corridor Hill"));

  const toggle = document.createElement("button");
  toggle.className = "navbar__toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Toggle navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<span></span><span></span><span></span>';

  const menu = document.createElement("div");
  menu.className = "navbar__menu";

  const list = document.createElement("ul");
  list.className = "navbar__links";

  items.forEach((item) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.href;
    a.textContent = item.label;
    // Highlight the current page. aria-current announces it to screen
    // readers too — the class alone is visual only.
    if (window.location.pathname.endsWith(item.href)) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    }
    li.appendChild(a);
    list.appendChild(li);
  });

const logoutLi = document.createElement("li");
  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "btn btn--ghost btn--sm navbar__logout";
  logoutBtn.textContent = "Logout";
  logoutBtn.addEventListener("click", () => {
    // Close the mobile menu before navigating away.
    menu.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    logout();
  });
  logoutLi.appendChild(logoutBtn);
  list.appendChild(logoutLi);

  menu.appendChild(list);
  nav.appendChild(brand);
  nav.appendChild(toggle);
  nav.appendChild(menu);
  mount.appendChild(nav);

  // Mobile toggle behavior.
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    menu.classList.toggle("is-open");
  });
}
