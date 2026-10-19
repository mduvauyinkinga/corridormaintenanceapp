/**
 * Releases every bed assigned to a resident whose Firestore profile is
 * deleted. Deploy this with Firebase Functions so deletes made in the
 * Firestore console are reflected in availability without opening the
 * management dashboard.
 */
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

exports.releaseUnitsForDeletedResident = onDocumentDeleted(
  "users/{uid}",
  async (event) => {
    const uid = event.params.uid;
    const db = getFirestore();

    // Query by residentId instead of relying only on the profile's unitId:
    // this also repairs older profiles that were missing that field.
    const units = await db.collection("units")
      .where("residentId", "==", uid)
      .get();

    await Promise.all(units.docs.map(async (unitDoc) => {
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(unitDoc.ref);
        // Do not free a bed if it was assigned to somebody else while this
        // event was waiting to be processed.
        if (current.exists && current.get("residentId") === uid) {
          transaction.update(unitDoc.ref, {
            occupied: false,
            residentId: null,
          });
        }
      });
    }));
  }
);
