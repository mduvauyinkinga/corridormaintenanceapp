/**
 * components/PhotoGallery.js
 * ------------------------------------------------------------------
 * Complaint photo thumbnails + a full-screen viewer.
 *
 * Port of the website's shared lightbox (js/lightbox.js): tap a thumbnail
 * to open the image, swipe/next/prev between images, a position counter
 * ("2 of 5") and a close control. Photos are the same download URLs stored
 * in `complaints.photoURLs`.
 */

import React, { useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typography } from "../theme";

export default function PhotoGallery({ urls = [], emptyMessage = "No photos attached." }) {
  const [index, setIndex] = useState(null);
  const insets = useSafeAreaInsets();
  const photos = Array.isArray(urls) ? urls.filter(Boolean) : [];

  if (photos.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const current = index === null ? 0 : index;

  return (
    <View>
      <FlatList
        data={photos}
        horizontal
        keyExtractor={(item, i) => `${i}-${item}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbRow}
        renderItem={({ item, index: i }) => (
          <Pressable
            onPress={() => setIndex(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Open photo ${i + 1} of ${photos.length}`}
            style={styles.thumbButton}
          >
            <Image source={{ uri: item }} style={styles.thumb} resizeMode="cover" />
          </Pressable>
        )}
      />

      <Modal
        visible={index !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIndex(null)}
      >
        <View style={styles.viewer}>
          <View style={[styles.viewerHeader, { paddingTop: insets.top + spacing.md }]}>
            <Text style={styles.counter}>
              {current + 1} of {photos.length}
            </Text>
            <Pressable
              onPress={() => setIndex(null)}
              accessibilityRole="button"
              accessibilityLabel="Close image viewer"
              hitSlop={12}
            >
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <Image
            source={{ uri: photos[current] }}
            style={styles.fullImage}
            resizeMode="contain"
          />

          {photos.length > 1 ? (
            <View style={[styles.viewerFooter, { paddingBottom: insets.bottom + spacing.md }]}>
              <Pressable
                style={styles.navButton}
                onPress={() => setIndex((current - 1 + photos.length) % photos.length)}
                accessibilityRole="button"
                accessibilityLabel="Previous image"
              >
                <Text style={styles.navText}>‹ Prev</Text>
              </Pressable>
              <Pressable
                style={styles.navButton}
                onPress={() => setIndex((current + 1) % photos.length)}
                accessibilityRole="button"
                accessibilityLabel="Next image"
              >
                <Text style={styles.navText}>Next ›</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyBox: {
    padding: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: "#f4f6f9",
  },
  emptyText: { color: colors.textMuted, fontSize: typography.small },
  thumbRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  thumbButton: {
    borderRadius: radius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 96, height: 96, backgroundColor: "#eef1f5" },
  viewer: { flex: 1, backgroundColor: "rgba(13, 42, 66, 0.96)" },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  counter: { color: "#ffffff", fontWeight: "600", fontSize: typography.small },
  close: { color: colors.accent, fontWeight: "700", fontSize: typography.body },
  fullImage: { flex: 1, width: "100%" },
  viewerFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  navButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
  },
  navText: { color: "#ffffff", fontWeight: "700" },
});
