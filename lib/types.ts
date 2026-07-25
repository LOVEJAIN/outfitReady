export type WardrobeCategory =
  | "Upper Wear"
  | "Bottom Wear"
  | "Footwear"
  | "Accessories"
  | "Traditional"
  | "Custom";

export type WardrobeItem = {
  id: string;
  name: string;
  category: WardrobeCategory;
  color: string;
  notes: string;
  favorite: boolean;
  tags: string[];
  createdAt: string;
  imageDataUrl: string;
};

export type OutfitItem = {
  wardrobeItemId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  layer: number;
  mirrored: boolean;
  opacity: number;
};

export type Outfit = {
  id: string;
  name: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  notes: string;
  collection: string;
  items: OutfitItem[];
};

export type MannequinSettings = {
  faceDataUrl: string | null;
  skinTone: string;
  height: string;
  bodyType: string;
  pose: string;
  genderPresentation: string;
  scale: number;
};

export type Preferences = {
  theme: "light";
  reducedMotion: boolean;
};

export type WardrobeSnapshot = {
  version: 1;
  exportedAt: string;
  wardrobe: WardrobeItem[];
  outfits: Outfit[];
  mannequin: MannequinSettings;
  preferences: Preferences;
  collections: string[];
  categories: string[];
};
