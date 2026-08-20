import type { Request } from 'express';
import type { ResolvedRole } from '../rbac/permission.service.js';

/**
 * Auth middleware to'ldiradigan maydonlar.
 *
 * Express'dagi `req.user` / `req.permissions` / `req.branchId` ... bilan
 * AYNAN bir xil nomlar — ko'chirilgan servis kodi ularni o'zgartirmasdan
 * o'qishi uchun.
 */
export interface AuthenticatedUser {
  id: string;
  /** Eski kod `req.user._id` ni o'qiydi — taxallus saqlanadi. */
  _id: string;
  role: string;
  isActive: boolean;
  isDeleted: boolean;
  homeBranchId: string | null;
  branchAssignments: { branchId: string; role: string | null }[];
  [key: string]: unknown;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  /** Joriy filialdagi AMALDAGI rol. */
  role?: ResolvedRole;
  /** Asosiy (global) rol — ba'zi tekshiruvlar unga tayanadi. */
  baseRole?: ResolvedRole;
  permissions?: string[];
  branchId?: string | null;
  allowedBranchIds?: string[];
  canSeeAllBranches?: boolean;
  branchRole?: string | null;
}
