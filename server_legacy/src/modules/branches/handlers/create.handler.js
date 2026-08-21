import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branches.service.js";

const create = asyncHandler(async (req, res) => {
  // Direktor IXTIYORIY: berilsa filial bilan birga yaratiladi.
  const withDirector = Boolean(req.body?.director);

  const data = await service.createWithDirector(req.body, {
    _id: req.user._id,
    permissions: req.permissions,
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });

  res.status(201).json({
    success: true,
    data,
    // Xabar amalga MOS bo'lishi kerak: direktorsiz yaratilganda ham
    // "direktor yaratildi" deyilsa, ega uni qidirib yurardi.
    message: withDirector ? "Filial va direktor yaratildi" : "Filial yaratildi",
  });
});

export default create;
