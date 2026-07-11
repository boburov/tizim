import {
  // Emoji Animations
  timeEmojiAnimation,
  magicEmojiAnimation,
  folderEmojiAnimation,
  greetingEmojiAnimation,
  statsBarEmojiAnimation,

  // Duck Animations
  pedroDuckAnimation,
  coolmanDuckAnimation,
  greetingDuckAnimation,
  blowingKissDuckAnimation,
} from "@/shared/assets/animations";

export const animationFamilies = ["emoji", "duck"];

export const animationSentiments = [
  "positive",
  "neutral",
  "negative",
  "playful",
];

export const animationCatalog = [
  {
    id: "emoji-time",
    key: "timeEmojiAnimation",
    family: "emoji",
    category: "time",
    sentiment: "neutral",
    tags: ["time", "schedule", "deadline"],
    animation: timeEmojiAnimation,
  },
  {
    id: "emoji-magic",
    key: "magicEmojiAnimation",
    family: "emoji",
    category: "magic",
    sentiment: "positive",
    tags: ["magic", "surprise", "success"],
    animation: magicEmojiAnimation,
  },
  {
    id: "emoji-folder",
    key: "folderEmojiAnimation",
    family: "emoji",
    category: "files",
    sentiment: "neutral",
    tags: ["folder", "files", "documents"],
    animation: folderEmojiAnimation,
  },
  {
    id: "emoji-greeting",
    key: "greetingEmojiAnimation",
    family: "emoji",
    category: "greeting",
    sentiment: "positive",
    tags: ["hello", "welcome", "greeting"],
    animation: greetingEmojiAnimation,
  },
  {
    id: "emoji-stats-bar",
    key: "statsBarEmojiAnimation",
    family: "emoji",
    category: "statistics",
    sentiment: "positive",
    tags: ["stats", "chart", "progress"],
    animation: statsBarEmojiAnimation,
  },
  {
    id: "duck-pedro",
    key: "pedroDuckAnimation",
    family: "duck",
    category: "character",
    sentiment: "playful",
    tags: ["duck", "fun", "mascot"],
    animation: pedroDuckAnimation,
  },
  {
    id: "duck-coolman",
    key: "coolmanDuckAnimation",
    family: "duck",
    category: "character",
    sentiment: "positive",
    tags: ["cool", "duck", "confidence"],
    animation: coolmanDuckAnimation,
  },
  {
    id: "duck-greeting",
    key: "greetingDuckAnimation",
    family: "duck",
    category: "greeting",
    sentiment: "positive",
    tags: ["duck", "welcome", "hello"],
    animation: greetingDuckAnimation,
  },
  {
    id: "duck-blowing-kiss",
    key: "blowingKissDuckAnimation",
    family: "duck",
    category: "reaction",
    sentiment: "positive",
    tags: ["duck", "reaction", "kiss"],
    animation: blowingKissDuckAnimation,
  },
];

export const emojiAnimations = animationCatalog.filter(
  (item) => item.family === "emoji",
);

export const duckAnimations = animationCatalog.filter(
  (item) => item.family === "duck",
);
