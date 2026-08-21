import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/budget.service.js";

export const list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listBudgets(req.query) });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getBudget(req.params.id) });
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.createBudget(req.body, req.user) });
});

export const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.updateBudget(req.params.id, req.body, req.user) });
});

export const remove = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.removeBudget(req.params.id, req.user) });
});
