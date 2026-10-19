/**
 * choose-room.js
 * Guided room selection flow: Block -> Room number -> Room letter -> Confirm.
 *
 * Flow (mirrors mobile/src/screens/auth/ChooseRoomScreen.js):
 *   Step 1  choose a block        -> static list A-F (no read needed)
 *   Step 2  choose a room number  -> GET /api/rooms?block=A
 *   Step 3  choose A, B or C      -> GET /api/units?roomId=:id, grouped per
 *                                    letter, two beds each; a letter is
 *                                    selectable while at least one bed is free
 *   Step 4  confirm               -> POST /api/units/claim (atomic, re-checks
 *                                    availability server-side)
 */

import { getToken, api } from "./api.js";
import { showError, clearError, setButtonLoading, $ } from "./utils.js";

const BLOCKS = ["A", "B", "C", "D", "E", "F"];
const ROOM_LETTERS = ["A", "B", "C"];

let currentUid = null;
let selectedBlock = null;
let selectedRoom = null;
let selectedUnit = null;

const blockSelect = $("#block-select");
const roomSelect = $("#room-select");
const unitList = $("#unit-list");
const blockStatus = $("#block-status");
const roomStatus = $("#room-status");
const unitStatus = $("#unit-status");
const summary = $("#selection-summary");
const selectionText = $("#selection-text");
const confirmBtn = $("#confirm-btn");

const progressSteps = Array.from(document.querySelectorAll(".room-progress__step"));

function setProgress(step) {
  progressSteps.forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle("is-active", n === step);
    el.classList.toggle("is-done", n < step);
  });
}

function roomListReset(hint) {
  roomSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = hint;
  roomSelect.appendChild(placeholder);
  roomSelect.disabled = true;
  roomStatus.textContent = hint;
}

function unitListReset(hint) {
  unitList.innerHTML = "";
  unitStatus.textContent = hint;
}

function updateSelection() {
  if (!selectedRoom || !selectedUnit) {
    summary.hidden = true;
    selectionText.textContent = "";
    confirmBtn.disabled = true;
    return;
  }
  summary.hidden = false;
  selectionText.textContent =
    `Block ${selectedBlock} · Room ${selectedRoom.roomNumber} · Room ${selectedUnit.roomLetter}`;
  confirmBtn.disabled = false;
}
async function getProfile() {
  if (!getToken()) {
    window.location.href = "login.html";
    return null;
  }
  try {
    const data = await api("/auth/me", { auth: true });
    return data.user || null;
  } catch (error) {
    if (error && error.status === 401) {
      window.location.href = "login.html";
      return null;
    }
    throw error;
  }
}

async function boot() {
  clearError();
  setProgress(1);

  // Auth guard: must be signed in as resident.
  let profile = null;
  try {
    profile = await getProfile();
  } catch (error) {
    console.error("[choose-room] profile load failed:", error);
    showError("Could not verify your session. Please try again.");
    return;
  }
  if (!profile) return;
  if (profile.role === "management") {
    window.location.href = "management.html";
    return;
  }
  // Residents who already have a room go straight to the dashboard.
  if (profile.roomId) {
    window.location.href = "dashboard.html";
    return;
  }
  currentUid = profile.uid || null;

  // Step 1: static block list (no read needed).
  blockSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a block…";
  blockSelect.appendChild(placeholder);
  BLOCKS.forEach((letter) => {
    const opt = document.createElement("option");
    opt.value = letter;
    opt.textContent = `Block ${letter}`;
    blockSelect.appendChild(opt);
  });
  blockSelect.disabled = false;
  blockStatus.textContent = "Choose a block to see its rooms.";
  roomListReset("Select a block first…");
  unitListReset("Select a room first.");
  setProgress(1);
}

blockSelect.addEventListener("change", () => {
  clearError();
  selectedBlock = blockSelect.value || null;
  selectedRoom = null;
  selectedUnit = null;
  updateSelection();
  roomListReset(selectedBlock ? "Loading rooms…" : "Select a block first…");
  unitListReset("Select a room first.");
  if (!selectedBlock) {
    setProgress(1);
    return;
  }
  setProgress(2);
  loadRooms(selectedBlock);
});
/* Step 1 -> 2: load the rooms of the chosen block. */
async function loadRooms(block) {
  try {
    const data = await api(`/rooms?block=${encodeURIComponent(block)}`, { auth: true });
    const rooms = Array.isArray(data.rooms) ? data.rooms : [];
    roomSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = rooms.length ? "Select a room…" : "No rooms found in this block.";
    roomSelect.appendChild(placeholder);
    rooms
      .slice()
      .sort((a, b) =>
        String(a.roomNumber ?? "").localeCompare(String(b.roomNumber ?? ""), undefined, { numeric: true })
      )
      .forEach((room) => {
        const opt = document.createElement("option");
        opt.value = room.id;
        opt.textContent = `Room ${room.roomNumber}`;
        opt.dataset.roomNumber = String(room.roomNumber ?? "");
        roomSelect.appendChild(opt);
      });
    roomSelect.disabled = rooms.length === 0;
    roomStatus.textContent = rooms.length
      ? `${rooms.length} room(s) found. Select one to see its rooms.`
      : "No rooms found in this block.";
  } catch (error) {
    console.error("[choose-room] loadRooms:", error);
    roomListReset("Could not load rooms.");
    showError("Could not load rooms. Please try again.");
  }
}

roomSelect.addEventListener("change", () => {
  clearError();
  const roomId = roomSelect.value;
  const opt = roomSelect.selectedOptions ? roomSelect.selectedOptions[0] : null;
  if (!roomId || !opt) {
    selectedRoom = null;
    selectedUnit = null;
    updateSelection();
    unitListReset("Select a room first.");
    setProgress(2);
    return;
  }
  selectedRoom = {
    id: roomId,
    block: selectedBlock,
    roomNumber: opt.dataset ? opt.dataset.roomNumber || opt.textContent : opt.textContent,
  };
  selectedUnit = null;
  updateSelection();
  setProgress(3);
  unitListReset("Loading bed slots…");
  loadUnits(roomId);
});

/* Step 2 -> 3: load the bed slots of the chosen room, grouped by letter. */
async function loadUnits(roomId) {
  try {
    const data = await api(`/units?roomId=${encodeURIComponent(roomId)}`, { auth: true });
    renderUnits(Array.isArray(data.units) ? data.units : []);
  } catch (error) {
    console.error("[choose-room] loadUnits:", error);
    unitListReset("Could not load rooms.");
    showError("Could not load rooms. Please try again.");
  }
}


function groupSlotsByLetter(units) {
  const byLetter = new Map();
  units
    .filter((unit) => Number.isInteger(unit.bedNumber))
    .forEach((unit) => {
      const letter = unit.roomLetter || unit.unitName;
      if (!letter) return;
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(unit);
    });
  return ROOM_LETTERS.map((letter) => {
    const slots = (byLetter.get(letter) || []).sort((a, b) => a.bedNumber - b.bedNumber);
    const availableSlots = slots.filter((slot) => slot.occupied === false);
    return { letter, slots, availableSlots, available: availableSlots.length > 0 };
  });
}

function renderUnits(units) {
  unitList.innerHTML = "";
  const groups = groupSlotsByLetter(units);
  const anyAvailable = groups.some((group) => group.available);

  groups.forEach((group) => {
    const label = document.createElement("label");
    label.className = "room-option" + (group.available ? "" : " is-occupied");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "room-letter";
    radio.value = group.letter;
    radio.disabled = !group.available;

    const text = document.createElement("span");
    text.textContent = `Room ${group.letter}`;

    const status = document.createElement("span");
    status.className =
      "room-option__status " +
      (group.available ? "room-option__status--available" : "room-option__status--occupied");
    if (group.slots.length === 0) {
      status.textContent = "No beds";
    } else if (group.available) {
      status.textContent = `${group.availableSlots.length}/${group.slots.length} avail`;
    } else {
      status.textContent = "Occupied";
    }

    label.append(radio, text, status);
    unitList.appendChild(label);

    radio.addEventListener("change", () => {
      clearError();
      if (!radio.checked || !group.available) return;
      selectedUnit = { ...group.availableSlots[0], roomLetter: group.letter };
      setProgress(4);
      updateSelection();
    });
  });

  unitStatus.textContent = anyAvailable
    ? "Select an available room."
    : "No available rooms here. Try another room number.";
}

/* Step 4: confirm — atomic claim via POST /api/units/claim. */
confirmBtn.addEventListener("click", async () => {
  clearError();
  if (!currentUid || !selectedRoom || !selectedUnit) {
    showError("Please choose a block, room number, and room first.");
    return;
  }
  const restore = setButtonLoading(confirmBtn, "Confirming…");
  try {
    await api("/units/claim", {
      method: "POST",
      body: {
        // No uid: the server derives it from the auth token.
        unitId: selectedUnit.id,
        roomId: selectedRoom.id,
        block: selectedRoom.block ?? selectedBlock ?? null,
        roomNumber: Number(selectedRoom.roomNumber ?? selectedUnit.roomNumber),
      },
    });
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("[choose-room] claim failed:", error);
    showError(error && error.message ? error.message : "Could not confirm. Try again.");
    if (selectedRoom) {
      selectedUnit = null;
      updateSelection();
      setProgress(3);
      unitListReset("Refreshing availability…");
      loadUnits(selectedRoom.id);
    }
    restore();
  }
});

boot();

