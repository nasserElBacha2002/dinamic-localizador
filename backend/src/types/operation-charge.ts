export interface OperationChargeAssignment {
  id: string;
  companyId: string;
  operationId: string;
  /** Collaborator identity (Encargado) bound at assignment time via user ↔ employee link. */
  employeeId: string;
  userId: string;
  validFrom: string;
  validUntil: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  endedByUserId: string | null;
  cancelledByUserId: string | null;
}

export interface CompanyUserEmployeeLink {
  companyId: string;
  userId: string;
  employeeId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  previousEmployeeId: string | null;
  lastReplacedAt: string | null;
  lastReplacedByUserId: string | null;
}
