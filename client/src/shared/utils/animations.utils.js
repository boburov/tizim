// Data
import { animationCatalog } from "../data/animations.data";

const ANIMATION_RANDOM_CACHE_PREFIX = "admin_animations_random";

const normalizeToArray = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (value) return [value];
  return [];
};

export const getAnimations = ({ family, category, sentiment } = {}) => {
  const sentiments = normalizeToArray(sentiment);

  return animationCatalog.filter((item) => {
    const familyMatch = family ? item.family === family : true;
    const categoryMatch = category ? item.category === category : true;
    const sentimentMatch = sentiments.length
      ? sentiments.includes(item.sentiment)
      : true;

    return familyMatch && categoryMatch && sentimentMatch;
  });
};

export const getAnimationById = (id) => {
  if (!id) return null;
  return animationCatalog.find((item) => item.id === id) || null;
};

export const getRandomAnimation = (animations) => {
  if (!Array.isArray(animations) || animations.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * animations.length);
  return animations[randomIndex] || null;
};

export const getRandomAnimationByFilters = (filters = {}) => {
  const animations = getAnimations(filters);
  return getRandomAnimation(animations);
};

const getSafeLocalStorage = () => {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const buildCacheKey = ({ cacheKey, family, category, sentiment }) => {
  const finalCacheKey = cacheKey || "default";
  const familyKey = family || "all-families";
  const categoryKey = category || "all-categories";
  const sentiments = normalizeToArray(sentiment);
  const sentimentKey = sentiments.length
    ? [...new Set(sentiments)].sort().join("|")
    : "all-sentiments";

  return `${ANIMATION_RANDOM_CACHE_PREFIX}:${finalCacheKey}:${familyKey}:${categoryKey}:${sentimentKey}`;
};

export const clearTimedRandomAnimation = (options = {}) => {
  const storage = getSafeLocalStorage();
  if (!storage) return;

  const key = buildCacheKey(options);
  storage.removeItem(key);
};

// Returns the same random animation within ttlMs so the UI does not flicker between renders
export const getTimedRandomAnimation = (options = {}) => {
  const {
    family,
    category,
    sentiment,
    ttlMs = 60 * 60 * 1000,
    cacheKey,
    now = Date.now(),
  } = options;

  const scopedFilters = { family, category, sentiment };
  const animations = getAnimations(scopedFilters);
  if (!animations.length) return null;

  const storage = getSafeLocalStorage();
  if (!storage || ttlMs <= 0) {
    return getRandomAnimation(animations);
  }

  const key = buildCacheKey({ cacheKey, family, category, sentiment });
  const cachedRaw = storage.getItem(key);

  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      const isCacheAlive = cached?.expiresAt > now;

      if (isCacheAlive && cached?.animationId) {
        const cachedAnimation = animations.find(
          (item) => item.id === cached.animationId
        );

        if (cachedAnimation) {
          return cachedAnimation;
        }
      }
    } catch {
      storage.removeItem(key);
    }
  }

  const randomAnimation = getRandomAnimation(animations);
  if (!randomAnimation) return null;

  const nextCache = {
    animationId: randomAnimation.id,
    expiresAt: now + ttlMs,
  };

  storage.setItem(key, JSON.stringify(nextCache));
  return randomAnimation;
};
