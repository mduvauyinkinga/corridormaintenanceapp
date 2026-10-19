/**
 * screens/resident/EditComplaintScreen.js
 * ------------------------------------------------------------------
 * Port of the "Edit Complaint" modal in tracking.html + js/tracking.js.
 *
 * Rules preserved:
 *   - only the category, the selected issues and the notes are written
 *     (the status is untouched so the Firestore rule
 *     `request.resource.data.status == resource.data.status` still allows it),
 *   - editing is only offered while the complaint is Submitted or Received,
 *   - a "Complaint Edited" timeline event is recorded.
 */

import React, { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";

import Button from "../../components/Button";
import CheckboxGroup from "../../components/CheckboxGroup";
import { Card, ScreenTitle } from "../../components/Layout";
import OptionPicker from "../../components/OptionPicker";
import { ErrorNotice, FormAlert, LoadingState } from "../../components/States";
import TextField from "../../components/TextField";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  fetchComplaint,
  updateComplaintDetails,
} from "../../services/complaintService";
import { colors, spacing } from "../../theme";
import { COMPLAINT_CATEGORIES, isEditableStatus, issuesForCategory } from "../../utils/complaints";
import { getErrorMessage } from "../../utils/errors";
import { validateComplaint } from "../../utils/validation";

export default function EditComplaintScreen({ navigation, route }) {
  const complaintId = route?.params?.complaintId;
  const { profile, uid } = useAuth();
  const { showToast } = useToast();

  const [category, setCategory] = useState("");
  const [issues, setIssues] = useState([]);
  // Stored issues that are not in the current category's checklist (e.g.
  // legacy data). Kept in state — not derived — so unchecking one keeps it
  // in the list, exactly like the website's edit modal (js/tracking.js).
  const [legacyIssues, setLegacyIssues] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");

  const categoryOptions = COMPLAINT_CATEGORIES.map((item) => ({ value: item, label: item }));

  /**
   * Issues for the chosen category plus any stored issues that are not in
   * the current list (e.g. legacy data) so nothing is silently dropped —
   * mirrors openEditModal in js/tracking.js.
   */
  const issueOptions = [...issuesForCategory(category), ...legacyIssues];

  /** Changing the category rebuilds the checklist, keeping still-relevant ticks. */
  const selectCategory = (value) => {
    setCategory(value);
    // The website rebuilds the checklist from the new category's list only,
    // so stored extras are dropped from the options at this point.
    setLegacyIssues([]);
    const allowed = new Set(issuesForCategory(value));
    setIssues((current) => current.filter((issue) => allowed.has(issue)));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const complaint = await fetchComplaint(complaintId);
        if (cancelled || !complaint) return;
        const storedCategory = complaint.category || "";
        const selected = Array.isArray(complaint.issues) ? complaint.issues : [];
        setCategory(storedCategory);
        setIssues(selected);
        // Keep stored issues that are not in this category's checklist
        // (legacy data) so they show up ticked instead of vanishing.
        const known = new Set(issuesForCategory(storedCategory));
        setLegacyIssues(selected.filter((issue) => !known.has(issue)));
        setNotes(complaint.notes || "");
        if (!isEditableStatus(complaint.status)) {
          setError("This complaint can no longer be edited.");
        }
      } catch (loadError) {
        console.error("[EditComplaintScreen] load error:", loadError);
        if (!cancelled) setError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [complaintId]);

  const toggleIssue = useCallback((issue) => {
    setIssues((current) =>
      current.includes(issue) ? current.filter((item) => item !== issue) : [...current, issue]
    );
  }, []);

  const handleSave = async () => {
    setError("");
    const validation = validateComplaint({ category, issues });
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      await updateComplaintDetails(complaintId, {
        category,
        issues,
        notes: notes.trim(),
        authorId: uid,
        authorName: profile?.name || "Resident",
      });
      showToast("Complaint updated successfully!", "success");
      navigation.goBack();
    } catch (saveError) {
      console.error("[EditComplaintScreen] save error:", saveError);
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Loading complaint…" />;

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Edit complaint" subtitle="Update the category, issues or notes." />
        <ErrorNotice message={error} />
        <FormAlert message="" />
        <Card>
          <OptionPicker
            label="Category"
            required
            value={category}
            options={categoryOptions}
            onChange={selectCategory}
            error={errors.category}
            placeholder="Select a category…"
          />
          <CheckboxGroup
            label="Select issue(s)"
            required
            options={issueOptions}
            values={issues}
            onToggle={toggleIssue}
            error={errors.issues}
          />
          <TextField
            label="Additional notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Provide any extra details about the issue(s)…"
            multiline
            numberOfLines={4}
          />
          <Button
            title="Save Changes"
            fullWidth
            loading={saving}
            loadingText="Saving…"
            onPress={handleSave}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
});