/**
 * screens/auth/ChooseRoomScreen.js
 * ------------------------------------------------------------------
 * Port of choose-room.html + js/choose-room.js.
 *
 * Flow (identical to the website):
 *   Step 1  choose a block        → static list A–F (no read needed)
 *   Step 2  choose a room number  → rooms where block == chosen block
 *   Step 3  choose A, B or C      → units where roomId == chosen room,
 *                                   grouped per letter, two beds each; a
 *                                   letter is selectable while at least one
 *                                   of its beds is free
 *   Step 4  confirm               → Firestore transaction that re-checks
 *                                   availability, marks the bed occupied and
 *                                   writes the room onto the profile
 *
 * Guard: the navigator already keeps residents who have a room on the
 * resident tabs, matching requireRole() on the website (which redirects
 * choose-room.html to dashboard.html).
 */

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Button from "../../components/Button";
import { Card, SectionTitle } from "../../components/Layout";
import OptionPicker from "../../components/OptionPicker";
import { FormAlert, LoadingState } from "../../components/States";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { claimUnit, fetchRoomsByBlock, fetchUnitsByRoom } from "../../services/roomService";
import { colors, radius, spacing, typography } from "../../theme";
import { getErrorMessage } from "../../utils/errors";
import { BLOCKS, groupSlotsByLetter } from "../../utils/rooms";

const STEP_LABELS = ["Block", "Room number", "Room", "Confirm"];

export default function ChooseRoomScreen() {
  const { uid, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [block, setBlock] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [letters, setLetters] = useState([]);
  const [selectedLetter, setSelectedLetter] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const step = !block ? 1 : !roomId ? 2 : !selectedLetter ? 3 : 4;

  const blockOptions = useMemo(
    () => BLOCKS.map((letter) => ({ value: letter, label: `Block ${letter}` })),
    []
  );

  const roomOptions = useMemo(
    () => rooms.map((room) => ({ value: room.id, label: `Room ${room.roomNumber}` })),
    [rooms]
  );

  /* Step 1 → 2: load the rooms of the chosen block. */
  const handleBlockChange = useCallback(async (value) => {
    setBlock(value);
    setRoomId("");
    setSelectedLetter("");
    setLetters([]);
    setError("");
    setLoading(true);
    try {
      const list = await fetchRoomsByBlock(value);
      setRooms(list);
      if (list.length === 0) setError("No rooms found in this block.");
    } catch (loadError) {
      console.error("[ChooseRoomScreen] load rooms error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  /* Step 2 → 3: load the bed slots of the chosen room. */
  const handleRoomChange = useCallback(async (value) => {
    setRoomId(value);
    setSelectedLetter("");
    setError("");
    setLoading(true);
    try {
      const units = await fetchUnitsByRoom(value);
      setLetters(groupSlotsByLetter(units));
    } catch (loadError) {
      console.error("[ChooseRoomScreen] load units error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  /* Step 4: claim the bed inside a transaction (js/choose-room.js). */
  const handleConfirm = async () => {
    const room = rooms.find((item) => item.id === roomId);
    const letterGroup = letters.find((item) => item.letter === selectedLetter);
    const unit = letterGroup?.availableSlots?.[0];

    if (!room || !unit) {
      setError("Please choose an available room before confirming.");
      return;
    }

    setError("");
    setConfirming(true);
    try {
      await claimUnit({ uid, unit, room });
      await refreshProfile(uid);
      showToast("Room assigned successfully!", "success");
    } catch (confirmError) {
      console.error("[ChooseRoomScreen] confirm error:", confirmError);
      setError(getErrorMessage(confirmError));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionTitle>Choose your room</SectionTitle>
      <Text style={styles.subtitle}>Select a block, then a room number, then A, B or C.</Text>

      <View style={styles.progress}>
        {STEP_LABELS.map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const done = step > number;
          return (
            <View key={label} style={styles.progressItem}>
              <View
                style={[
                  styles.progressDot,
                  active && styles.progressDotActive,
                  done && styles.progressDotDone,
                ]}
              >
                <Text
                  style={[styles.progressNumber, (active || done) && styles.progressNumberActive]}
                >
                  {number}
                </Text>
              </View>
              <Text style={[styles.progressLabel, active && styles.progressLabelActive]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <FormAlert message={error} />

      <Card>
        <OptionPicker
          label="Step 1 · Block"
          required
          value={block}
          options={blockOptions}
          onChange={handleBlockChange}
          placeholder="Select a block…"
          modalTitle="Choose a block"
        />

        <OptionPicker
          label="Step 2 · Room number"
          required
          value={roomId}
          options={roomOptions}
          onChange={handleRoomChange}
          placeholder={block ? "Select a room…" : "Select a block first…"}
          disabled={!block || loading}
          modalTitle="Choose a room number"
        />

        {loading ? <LoadingState message="Loading rooms…" /> : null}

        <Text style={styles.stepLabel}>Step 3 · Choose your room (A, B or C)</Text>
        {!roomId ? (
          <Text style={styles.hint}>Select a room number first.</Text>
        ) : letters.length === 0 ? (
          <Text style={styles.hint}>No units found in this room.</Text>
        ) : (
          letters.map((group) => {
            const occupied = group.slots.filter((slot) => slot.occupied === true).length;
            const selected = selectedLetter === group.letter;
            const statusLabel = group.slots.length
              ? `${group.availableSlots.length}/${group.slots.length} available`
              : "Unavailable";
            return (
              <Pressable
                key={group.letter}
                disabled={!group.available}
                onPress={() => {
                  setSelectedLetter(group.letter);
                  setError("");
                }}
                style={({ pressed }) => [
                  styles.letterOption,
                  selected && styles.letterOptionSelected,
                  !group.available && styles.letterOptionDisabled,
                  pressed && group.available && styles.letterOptionPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !group.available }}
                accessibilityLabel={`Room ${group.letter}, ${statusLabel}`}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.letterText}>Room {group.letter}</Text>
                <Text
                  style={[
                    styles.letterStatus,
                    group.available ? styles.letterAvailable : styles.letterOccupied,
                  ]}
                >
                  {group.slots.length ? `${occupied}/${group.slots.length} occupied` : statusLabel}
                </Text>
              </Pressable>
            );
          })
        )}
      </Card>

      {step === 4 ? (
        <Card>
          <Text style={styles.summaryLabel}>Your selection</Text>
          <Text style={styles.summaryValue}>
            {`Block ${block} · Room ${
              rooms.find((room) => room.id === roomId)?.roomNumber || "—"
            } · Room ${selectedLetter}`}
          </Text>
          <Button
            title="Confirm Room"
            fullWidth
            loading={confirming}
            loadingText="Confirming…"
            onPress={handleConfirm}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  subtitle: { color: colors.textMuted, marginBottom: spacing.lg },
  progress: { flexDirection: "row", marginBottom: spacing.lg, gap: spacing.sm },
  progressItem: { flex: 1, alignItems: "center" },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  progressDotActive: { borderColor: colors.primary },
  progressDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  progressNumber: { color: colors.textMuted, fontWeight: "700", fontSize: typography.tiny },
  progressNumberActive: { color: colors.primary },
  progressLabel: { marginTop: 4, fontSize: 10, color: colors.textMuted, textAlign: "center" },
  progressLabelActive: { color: colors.primary, fontWeight: "700" },
  stepLabel: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  hint: { color: colors.textMuted, fontSize: typography.small, marginBottom: spacing.sm },
  letterOption: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 52,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  letterOptionSelected: { borderColor: colors.primary, backgroundColor: "#eef3f8" },
  letterOptionDisabled: { backgroundColor: "#f4f6f9", opacity: 0.7 },
  letterOptionPressed: { opacity: 0.85 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  letterText: { flex: 1, fontWeight: "700", color: colors.text, fontSize: typography.body },
  letterStatus: { fontSize: typography.tiny, fontWeight: "700" },
  letterAvailable: { color: colors.success },
  letterOccupied: { color: colors.danger },
  summaryLabel: {
    fontSize: typography.tiny,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.textMuted,
    fontWeight: "700",
  },
  summaryValue: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontSize: typography.h3,
    fontWeight: "700",
    color: colors.primary,
  },
});