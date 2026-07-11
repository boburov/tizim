// "New" badge cutoff - kept short on purpose so it actually disappears
export const isNewMarketProduct = (createdAt) => {
  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return false;

  const diffMs = Date.now() - createdDate.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  return diffMs <= sevenDaysMs;
};

export const getMarketProductBadge = (product) => {
  if (!product) return null;

  if (Number(product.quantity) <= 0) {
    return { label: "Qolmagan", type: "neutral" };
  }

  if (isNewMarketProduct(product.createdAt)) {
    return { label: "Yangi", type: "primary" };
  }

  return null;
};
