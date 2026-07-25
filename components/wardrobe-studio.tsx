"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useDropzone } from "react-dropzone";
import {
  Check,
  Download,
  Heart,
  ImagePlus,
  Import,
  Lock,
  Printer,
  RotateCcw,
  ScissorsLineDashed,
  Search,
  Share2,
  Sparkles,
  Trash2,
  UserRound
} from "lucide-react";
import { Card, Button, GhostButton, Input } from "@/components/ui";
import { defaultSnapshot, loadSnapshot, resetSnapshot, saveSnapshot } from "@/lib/storage";
import type {
  Outfit,
  OutfitItem,
  Preferences,
  WardrobeItem,
  WardrobeSnapshot
} from "@/lib/types";
import {
  createId,
  dataUrlToBlob,
  downloadBlob,
  fileToDataUrl,
  formatDate,
  slugify
} from "@/lib/utils";

type Capabilities = {
  canShareFiles: boolean;
  canDownload: boolean;
  canPrint: boolean;
};

const starterCategories = [
  "Upper Wear",
  "Bottom Wear",
  "Footwear",
  "Accessories",
  "Traditional"
] as const;

const starterTrust = [
  "100% Private",
  "Photos never leave your device",
  "Runs entirely in your browser",
  "Local storage only"
];

function makeStarterOutfit(): Outfit {
  const now = new Date().toISOString();
  return {
    id: createId("outfit"),
    name: "Friday Night Look",
    favorite: true,
    collection: "Weekend",
    notes: "A polished first draft with room to play.",
    createdAt: now,
    updatedAt: now,
    items: []
  };
}

async function renderOutfitBlob(
  outfit: Outfit,
  wardrobe: WardrobeItem[],
  faceDataUrl: string | null
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available");
  }

  context.fillStyle = "#f8f2e8";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#e4d1c5";
  context.beginPath();
  context.roundRect(220, 180, 640, 1080, 320);
  context.fill();

  context.fillStyle = "#ceb19d";
  context.beginPath();
  context.ellipse(540, 145, 118, 136, 0, 0, Math.PI * 2);
  context.fill();

  if (faceDataUrl) {
    const face = await loadImage(faceDataUrl);
    context.save();
    context.beginPath();
    context.arc(540, 145, 105, 0, Math.PI * 2);
    context.clip();
    context.drawImage(face, 435, 35, 210, 220);
    context.restore();
  }

  const itemsById = new Map(wardrobe.map((item) => [item.id, item]));
  const layeredItems = [...outfit.items].sort((left, right) => left.layer - right.layer);

  for (const item of layeredItems) {
    const wardrobeItem = itemsById.get(item.wardrobeItemId);

    if (!wardrobeItem) {
      continue;
    }

    const image = await loadImage(wardrobeItem.imageDataUrl);
    const width = image.width * item.scale;
    const height = image.height * item.scale;
    const x = 540 + item.x - width / 2;
    const y = 720 + item.y - height / 2;

    context.save();
    context.globalAlpha = item.opacity;
    context.translate(540 + item.x, 720 + item.y);
    context.rotate((item.rotation * Math.PI) / 180);
    context.scale(item.mirrored ? -1 : 1, 1);
    context.drawImage(image, -width / 2, -height / 2, width, height);
    context.restore();
  }

  context.fillStyle = "#201713";
  context.font = "600 42px Georgia";
  context.fillText(outfit.name, 80, 1340);
  context.font = "28px Avenir Next";
  context.fillStyle = "#5f534d";
  context.fillText(outfit.notes || "Styled locally on your device.", 80, 1388);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Unable to create PNG"));
      }
    }, "image/png");
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = src;
  });
}

function detectCapabilities(): Capabilities {
  if (typeof window === "undefined") {
    return {
      canShareFiles: false,
      canDownload: false,
      canPrint: false
    };
  }

  const share = navigator.share;
  const canShareFiles =
    typeof share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({
      files: [new File(["test"], "test.txt", { type: "text/plain" })]
    });

  return {
    canShareFiles,
    canDownload: typeof URL !== "undefined",
    canPrint: typeof window.print === "function"
  };
}

export function WardrobeStudio() {
  const [snapshot, setSnapshot] = useState<WardrobeSnapshot>(defaultSnapshot);
  const [activeOutfitId, setActiveOutfitId] = useState<string>("");
  const [selectedLayerId, setSelectedLayerId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState<string>("");
  const [capabilities, setCapabilities] = useState<Capabilities>({
    canShareFiles: false,
    canDownload: false,
    canPrint: false
  });
  const [isPending, startTransition] = useTransition();
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCapabilities(detectCapabilities());
    void loadSnapshot().then((stored) => {
      setSnapshot(stored);
      setActiveOutfitId(stored.outfits[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!activeOutfitId && snapshot.outfits[0]) {
      setActiveOutfitId(snapshot.outfits[0].id);
    }
  }, [activeOutfitId, snapshot.outfits]);

  const activeOutfit = useMemo(
    () => snapshot.outfits.find((outfit) => outfit.id === activeOutfitId) ?? null,
    [activeOutfitId, snapshot.outfits]
  );

  const selectedLayer = useMemo(
    () => activeOutfit?.items.find((item) => item.wardrobeItemId === selectedLayerId) ?? null,
    [activeOutfit, selectedLayerId]
  );

  const filteredWardrobe = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return snapshot.wardrobe;
    }

    return snapshot.wardrobe.filter((item) => {
      return [item.name, item.category, item.color, item.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [searchTerm, snapshot.wardrobe]);

  async function commit(next: WardrobeSnapshot, nextToast?: string) {
    setSnapshot(next);
    await saveSnapshot(next);
    if (nextToast) {
      setToast(nextToast);
    }
  }

  async function addWardrobeFiles(files: File[]) {
    const mapped = await Promise.all(
      files.map(async (file) => ({
        id: createId("item"),
        name: file.name.replace(/\.[^.]+$/, ""),
        category: "Custom" as const,
        color: "Mixed",
        notes: "",
        favorite: false,
        tags: [],
        createdAt: new Date().toISOString(),
        imageDataUrl: await fileToDataUrl(file)
      }))
    );

    const next = {
      ...snapshot,
      wardrobe: [...mapped, ...snapshot.wardrobe]
    };

    await commit(next, `${mapped.length} item${mapped.length > 1 ? "s" : ""} added locally`);
  }

  const wardrobeDropzone = useDropzone({
    accept: { "image/*": [] },
    onDrop: (files) => {
      void addWardrobeFiles(files);
    }
  });

  const faceDropzone = useDropzone({
    accept: { "image/*": [] },
    maxFiles: 1,
    onDrop: async (files) => {
      const file = files[0];
      if (!file) {
        return;
      }

      const next = {
        ...snapshot,
        mannequin: {
          ...snapshot.mannequin,
          faceDataUrl: await fileToDataUrl(file)
        }
      };

      await commit(next, "Face photo saved on this device");
    }
  });

  async function ensureStarterOutfit() {
    if (snapshot.outfits.length > 0) {
      return;
    }

    const outfit = makeStarterOutfit();
    const next = {
      ...snapshot,
      outfits: [outfit]
    };
    await commit(next);
    setActiveOutfitId(outfit.id);
  }

  async function addItemToOutfit(itemId: string) {
    await ensureStarterOutfit();

    const targetOutfit = activeOutfit ?? makeStarterOutfit();
    const nextLayer: OutfitItem = {
      wardrobeItemId: itemId,
      x: 0,
      y: 0,
      scale: 0.7,
      rotation: 0,
      layer: targetOutfit.items.length + 1,
      mirrored: false,
      opacity: 1
    };

    const outfitId = activeOutfit?.id ?? targetOutfit.id;
    const outfits = snapshot.outfits.length
      ? snapshot.outfits.map((outfit) =>
          outfit.id === outfitId
            ? {
                ...outfit,
                updatedAt: new Date().toISOString(),
                items: [...outfit.items, nextLayer]
              }
            : outfit
        )
      : [{ ...targetOutfit, items: [nextLayer] }];

    await commit({ ...snapshot, outfits }, "Added to current outfit");
    setActiveOutfitId(outfitId);
    setSelectedLayerId(itemId);
  }

  async function updateOutfit(mutator: (outfit: Outfit) => Outfit) {
    if (!activeOutfit) {
      return;
    }

    const next = {
      ...snapshot,
      outfits: snapshot.outfits.map((outfit) =>
        outfit.id === activeOutfit.id ? mutator(outfit) : outfit
      )
    };
    await commit(next);
  }

  async function createOutfit() {
    const outfit = {
      ...makeStarterOutfit(),
      name: `Look ${snapshot.outfits.length + 1}`
    };
    await commit({ ...snapshot, outfits: [outfit, ...snapshot.outfits] }, "Fresh outfit created");
    setActiveOutfitId(outfit.id);
  }

  async function exportSnapshot() {
    const fileName = `wardrobe-export-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...snapshot,
            exportedAt: new Date().toISOString()
          },
          null,
          2
        )
      ],
      { type: "application/json" }
    );
    downloadBlob(blob, fileName);
    setToast("Wardrobe export downloaded");
  }

  async function importSnapshotFile(file: File) {
    const parsed = JSON.parse(await file.text()) as WardrobeSnapshot;
    await commit(parsed, "Wardrobe import complete");
    setActiveOutfitId(parsed.outfits[0]?.id ?? "");
  }

  async function handleOutfitDownload() {
    if (!activeOutfit) {
      return;
    }

    const blob = await renderOutfitBlob(
      activeOutfit,
      snapshot.wardrobe,
      snapshot.mannequin.faceDataUrl
    );
    downloadBlob(blob, `${slugify(activeOutfit.name)}.png`);
    setToast("Outfit PNG downloaded");
  }

  async function handleOutfitShare() {
    if (!activeOutfit) {
      return;
    }

    const blob = await renderOutfitBlob(
      activeOutfit,
      snapshot.wardrobe,
      snapshot.mannequin.faceDataUrl
    );
    const file = new File([blob], `${slugify(activeOutfit.name)}.png`, {
      type: "image/png"
    });

    if (capabilities.canShareFiles) {
      await navigator.share({
        title: activeOutfit.name,
        text: "Styled locally and shared directly from my private wardrobe.",
        files: [file]
      });
      setToast("Outfit handed to your device share sheet");
      return;
    }

    downloadBlob(blob, `${slugify(activeOutfit.name)}.png`);
    setToast("Share isn’t supported here, so the PNG was downloaded instead");
  }

  function handlePrint() {
    if (!activeOutfit) {
      return;
    }

    startTransition(() => {
      void renderOutfitBlob(activeOutfit, snapshot.wardrobe, snapshot.mannequin.faceDataUrl).then(
        async (blob) => {
          const url = URL.createObjectURL(blob);
          const printWindow = window.open("", "_blank", "noopener,noreferrer");

          if (!printWindow) {
            setToast("Popup blocked. Please allow popups to print.");
            return;
          }

          printWindow.document.write(`
            <html>
              <head>
                <title>${activeOutfit.name}</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 24px; color: #201713; }
                  img { width: 100%; max-width: 720px; display: block; margin: 0 auto 24px; border-radius: 24px; }
                  h1, p { text-align: center; }
                </style>
              </head>
              <body>
                <h1>${activeOutfit.name}</h1>
                <p>${activeOutfit.notes || "Styled privately on-device."}</p>
                <img src="${url}" alt="${activeOutfit.name}" />
              </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
          URL.revokeObjectURL(url);
          setToast("Print dialog opened");
        }
      );
    });
  }

  async function downloadWardrobeItem(item: WardrobeItem) {
    downloadBlob(dataUrlToBlob(item.imageDataUrl), `${slugify(item.name)}.png`);
    setToast(`${item.name} downloaded`);
  }

  async function shareWardrobeItem(item: WardrobeItem) {
    const blob = dataUrlToBlob(item.imageDataUrl);
    const file = new File([blob], `${slugify(item.name)}.png`, { type: blob.type || "image/png" });

    if (capabilities.canShareFiles) {
      await navigator.share({
        title: item.name,
        files: [file]
      });
      setToast(`${item.name} sent to your share sheet`);
      return;
    }

    await downloadWardrobeItem(item);
  }

  async function toggleFavorite(itemId: string) {
    const next = {
      ...snapshot,
      wardrobe: snapshot.wardrobe.map((item) =>
        item.id === itemId ? { ...item, favorite: !item.favorite } : item
      )
    };
    await commit(next);
  }

  async function wipeEverything() {
    const cleared = await resetSnapshot();
    setSnapshot(cleared);
    setActiveOutfitId("");
    setSelectedLayerId("");
    setToast("Everything was removed from this device");
  }

  const wardrobeCount = snapshot.wardrobe.length;
  const outfitCount = snapshot.outfits.length;

  return (
    <main className="relative overflow-hidden">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-between"
        >
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-xs uppercase tracking-[0.28em] text-ink/65">
              <Lock className="h-3.5 w-3.5" />
              Privacy-first wardrobe
            </p>
            <h1 className="font-display text-4xl leading-tight text-ink sm:text-6xl">
              Your Private Digital Wardrobe
            </h1>
            <p className="mt-4 max-w-2xl text-base text-ink/70 sm:text-lg">
              Plan outfits visually without changing clothes ten times. Everything
              stays on your device, including sharing and downloads.
            </p>
          </div>
          <GhostButton
            type="button"
            className="no-print hidden md:inline-flex"
            onClick={createOutfit}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            New outfit
          </GhostButton>
        </motion.div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {starterTrust.map((item) => (
            <Card key={item} className="p-4">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-sage/55 p-2 text-ink">
                  <Check className="h-4 w-4" />
                </span>
                <p className="text-sm font-medium text-ink/80">{item}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Card className="bg-grain">
              <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-ink/55">
                    First-time flow
                  </p>
                  <div className="mt-4 space-y-4">
                    {[
                      "Upload your wardrobe",
                      "Upload your face",
                      "Start styling and sharing"
                    ].map((step, index) => (
                      <div key={step} className="flex items-center gap-4 rounded-3xl bg-white/65 p-4">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium text-ink">{step}</p>
                          <p className="text-sm text-ink/60">
                            {index === 2
                              ? "Download PNGs, print layouts, or use your device share sheet."
                              : "Files are processed only in your browser and stored locally."}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <div
                    {...wardrobeDropzone.getRootProps()}
                    className="cursor-pointer rounded-[30px] border border-dashed border-ink/15 bg-white/70 p-6 text-center transition hover:border-rose/70 hover:bg-white"
                  >
                    <input {...wardrobeDropzone.getInputProps()} />
                    <ImagePlus className="mx-auto mb-3 h-7 w-7 text-ink/70" />
                    <p className="font-medium text-ink">Drop wardrobe photos here</p>
                    <p className="mt-1 text-sm text-ink/55">
                      Unlimited local uploads for clothing, shoes, and accessories
                    </p>
                  </div>
                  <div
                    {...faceDropzone.getRootProps()}
                    className="cursor-pointer rounded-[30px] border border-dashed border-ink/15 bg-white/70 p-6 text-center transition hover:border-ocean/80 hover:bg-white"
                  >
                    <input {...faceDropzone.getInputProps()} />
                    <UserRound className="mx-auto mb-3 h-7 w-7 text-ink/70" />
                    <p className="font-medium text-ink">Drop one face photo</p>
                    <p className="mt-1 text-sm text-ink/55">
                      Used only to personalize the mannequin on this device
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl text-ink">Wardrobe Library</h2>
                  <p className="text-sm text-ink/60">
                    {wardrobeCount} items stored privately in IndexedDB
                  </p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/45" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by name, color, or tag"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                {starterCategories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-mist px-3 py-1 text-xs font-medium text-ink/65"
                  >
                    {category}
                  </span>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {filteredWardrobe.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[28px] border border-ink/10 bg-mist p-3 transition hover:-translate-y-1"
                  >
                    <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageDataUrl} alt={item.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{item.name}</p>
                        <p className="text-sm text-ink/55">
                          {item.category} · {item.color}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Toggle favorite"
                        onClick={() => {
                          void toggleFavorite(item.id);
                        }}
                      >
                        <Heart
                          className={`h-4 w-4 ${item.favorite ? "fill-current text-rose" : "text-ink/35"}`}
                        />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <GhostButton type="button" onClick={() => void addItemToOutfit(item.id)}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Add to outfit
                      </GhostButton>
                      <GhostButton type="button" onClick={() => void downloadWardrobeItem(item)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </GhostButton>
                      <GhostButton type="button" onClick={() => void shareWardrobeItem(item)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </GhostButton>
                    </div>
                  </div>
                ))}
              </div>

              {filteredWardrobe.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-ink/15 bg-mist/70 p-10 text-center">
                  <p className="font-medium text-ink">Your wardrobe is ready for its first upload.</p>
                  <p className="mt-2 text-sm text-ink/55">
                    Drag in a few clothing photos and they’ll stay local to this browser.
                  </p>
                </div>
              ) : null}
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="sticky top-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl text-ink">Outfit Builder</h2>
                  <p className="text-sm text-ink/60">
                    {outfitCount} outfit{outfitCount === 1 ? "" : "s"} locally saved
                  </p>
                </div>
                <GhostButton type="button" className="md:hidden" onClick={createOutfit}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  New
                </GhostButton>
              </div>

              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {snapshot.outfits.map((outfit) => (
                  <button
                    key={outfit.id}
                    type="button"
                    onClick={() => setActiveOutfitId(outfit.id)}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      outfit.id === activeOutfitId
                        ? "bg-ink text-white"
                        : "bg-mist text-ink/70 hover:bg-sand/45"
                    }`}
                  >
                    {outfit.name}
                  </button>
                ))}
              </div>

              <div className="relative mx-auto mb-5 flex aspect-[3/4] w-full max-w-md items-center justify-center overflow-hidden rounded-[32px] bg-gradient-to-b from-white to-[#f1e6d9]">
                <div className="absolute inset-x-[22%] top-[16%] h-[70%] rounded-t-[44%] rounded-b-[28%] bg-[#e4d1c5]" />
                <div className="absolute top-[7%] h-24 w-24 rounded-full bg-[#ceb19d]">
                  {snapshot.mannequin.faceDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={snapshot.mannequin.faceDataUrl}
                      alt="Mannequin face"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : null}
                </div>

                {activeOutfit?.items.map((layer) => {
                  const item = snapshot.wardrobe.find((entry) => entry.id === layer.wardrobeItemId);
                  if (!item) {
                    return null;
                  }

                  return (
                    <button
                      key={layer.wardrobeItemId}
                      type="button"
                      onClick={() => setSelectedLayerId(layer.wardrobeItemId)}
                      className={`absolute left-1/2 top-1/2 overflow-hidden rounded-2xl transition ${
                        selectedLayerId === layer.wardrobeItemId ? "ring-2 ring-rose" : ""
                      }`}
                      style={{
                        width: `${220 * layer.scale}px`,
                        opacity: layer.opacity,
                        transform: `translate(calc(-50% + ${layer.x}px), calc(-50% + ${layer.y}px)) rotate(${layer.rotation}deg) scaleX(${layer.mirrored ? -1 : 1})`
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageDataUrl} alt={item.name} className="w-full object-cover" />
                    </button>
                  );
                })}

                {activeOutfit?.items.length ? null : (
                  <div className="z-10 max-w-xs rounded-[28px] bg-white/75 p-4 text-center backdrop-blur">
                    <p className="font-medium text-ink">Tap a wardrobe item to place it here.</p>
                    <p className="mt-2 text-sm text-ink/55">
                      Outfit exports, printing, and sharing are generated directly in-browser.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <Button type="button" onClick={() => void handleOutfitDownload()}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PNG
                </Button>
                <GhostButton type="button" onClick={() => void handleOutfitShare()}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </GhostButton>
                <GhostButton type="button" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print / PDF
                </GhostButton>
              </div>

              {selectedLayer && activeOutfit ? (
                <div className="mt-5 rounded-[28px] bg-mist p-4">
                  <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-ink/55">
                    Layer controls
                  </p>
                  <div className="grid gap-4">
                    {[
                      {
                        label: "Scale",
                        value: selectedLayer.scale,
                        min: 0.3,
                        max: 1.4,
                        step: 0.05,
                        key: "scale"
                      },
                      {
                        label: "Rotation",
                        value: selectedLayer.rotation,
                        min: -45,
                        max: 45,
                        step: 1,
                        key: "rotation"
                      },
                      {
                        label: "Opacity",
                        value: selectedLayer.opacity,
                        min: 0.2,
                        max: 1,
                        step: 0.05,
                        key: "opacity"
                      }
                    ].map((control) => (
                      <label key={control.key} className="text-sm text-ink/70">
                        <span className="mb-2 block font-medium text-ink">{control.label}</span>
                        <input
                          type="range"
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          value={control.value}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            void updateOutfit((outfit) => ({
                              ...outfit,
                              updatedAt: new Date().toISOString(),
                              items: outfit.items.map((item) =>
                                item.wardrobeItemId === selectedLayer.wardrobeItemId
                                  ? { ...item, [control.key]: value }
                                  : item
                              )
                            }));
                          }}
                          className="w-full"
                        />
                      </label>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <GhostButton
                        type="button"
                        onClick={() => {
                          void updateOutfit((outfit) => ({
                            ...outfit,
                            updatedAt: new Date().toISOString(),
                            items: outfit.items.map((item) =>
                              item.wardrobeItemId === selectedLayer.wardrobeItemId
                                ? { ...item, mirrored: !item.mirrored }
                                : item
                            )
                          }));
                        }}
                      >
                        <ScissorsLineDashed className="mr-2 h-4 w-4" />
                        Flip
                      </GhostButton>
                      <GhostButton
                        type="button"
                        onClick={() => {
                          void updateOutfit((outfit) => ({
                            ...outfit,
                            updatedAt: new Date().toISOString(),
                            items: outfit.items.filter(
                              (item) => item.wardrobeItemId !== selectedLayer.wardrobeItemId
                            )
                          }));
                          setSelectedLayerId("");
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </GhostButton>
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-2xl text-ink">Privacy Dashboard</h2>
                  <p className="text-sm text-ink/60">
                    The app works after load with zero required uploads.
                  </p>
                </div>
                <Lock className="h-5 w-5 text-ink/50" />
              </div>

              <div className="grid gap-3">
                {[
                  "No account required",
                  "No cloud storage",
                  "No data uploaded",
                  "Photos stay on your device",
                  "Export your data anytime",
                  "Delete everything anytime"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-mist px-4 py-3">
                    <Check className="h-4 w-4 text-sage" />
                    <span className="text-sm text-ink/80">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[28px] bg-[#201713] p-5 text-white">
                <p className="text-sm uppercase tracking-[0.24em] text-white/55">Sharing rules</p>
                <p className="mt-2 text-sm leading-6 text-white/80">
                  Files are generated locally on your device. Nothing uploads unless you choose
                  another app in your device share sheet after export.
                </p>
                <div className="mt-4 grid gap-2 text-sm text-white/85">
                  <p>Share files supported: {capabilities.canShareFiles ? "Yes" : "No, download fallback active"}</p>
                  <p>Downloads supported: {capabilities.canDownload ? "Yes" : "Unavailable"}</p>
                  <p>Print supported: {capabilities.canPrint ? "Yes" : "Unavailable"}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <GhostButton type="button" onClick={() => void exportSnapshot()}>
                  <Download className="mr-2 h-4 w-4" />
                  Export wardrobe
                </GhostButton>
                <GhostButton type="button" onClick={() => importRef.current?.click()}>
                  <Import className="mr-2 h-4 w-4" />
                  Import wardrobe
                </GhostButton>
                <GhostButton type="button" onClick={wipeEverything}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset everything
                </GhostButton>
                <div className="rounded-full border border-ink/10 bg-mist px-4 py-2 text-sm text-ink/65">
                  Last export field updates automatically with each backup
                </div>
              </div>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void importSnapshotFile(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-2xl text-ink">Current State</h2>
                  <p className="text-sm text-ink/60">Everything below is persisted locally.</p>
                </div>
                <span className="rounded-full bg-sage/45 px-3 py-1 text-xs font-medium text-ink/70">
                  Updated {activeOutfit ? formatDate(activeOutfit.updatedAt) : "today"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Wardrobe Items", value: wardrobeCount },
                  { label: "Outfits", value: outfitCount },
                  { label: "Collections", value: snapshot.collections.length }
                ].map((stat) => (
                  <div key={stat.label} className="rounded-[24px] bg-mist p-4">
                    <p className="text-sm text-ink/55">{stat.label}</p>
                    <p className="mt-2 font-display text-3xl text-ink">{stat.value}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-glow">
          {toast}
        </div>
      ) : null}

      {isPending ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-white/40 backdrop-blur-sm">
          <div className="rounded-full bg-white px-4 py-2 text-sm text-ink shadow-glow">
            Preparing your print layout...
          </div>
        </div>
      ) : null}
    </main>
  );
}
