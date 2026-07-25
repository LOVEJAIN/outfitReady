import { openDB } from "idb";
import type {
  MannequinSettings,
  Outfit,
  Preferences,
  WardrobeItem,
  WardrobeSnapshot
} from "@/lib/types";

const DB_NAME = "private-digital-wardrobe";
const STORE_NAME = "app-state";
const KEY = "snapshot";

const defaultSnapshot: WardrobeSnapshot = {
  version: 1,
  exportedAt: new Date(0).toISOString(),
  wardrobe: [],
  outfits: [],
  mannequin: {
    faceDataUrl: null,
    skinTone: "Warm ivory",
    height: "Balanced",
    bodyType: "Classic",
    pose: "Relaxed",
    genderPresentation: "Fluid",
    scale: 1
  },
  preferences: {
    theme: "light",
    reducedMotion: false
  },
  collections: ["Weekend", "Office", "Vacation"],
  categories: []
};

async function getDb() {
  return await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    }
  });
}

export async function loadSnapshot() {
  const db = await getDb();
  return ((await db.get(STORE_NAME, KEY)) as WardrobeSnapshot | undefined) ?? defaultSnapshot;
}

export async function saveSnapshot(snapshot: WardrobeSnapshot) {
  const db = await getDb();
  const nextSnapshot = {
    ...snapshot,
    exportedAt: snapshot.exportedAt ?? new Date().toISOString()
  };
  await db.put(STORE_NAME, nextSnapshot, KEY);
  return nextSnapshot;
}

export async function resetSnapshot() {
  const db = await getDb();
  await db.put(STORE_NAME, defaultSnapshot, KEY);
  return defaultSnapshot;
}

export { defaultSnapshot };
