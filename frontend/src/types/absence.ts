export type AbsenceRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "NEEDS_INFO";

export type AbsenceRequestedVia = "WHATSAPP" | "ADMIN";

export type AbsenceDayPeriod = "FULL_DAY" | "AM" | "PM";

export interface AbsenceType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requiresApproval: boolean;
  requiresAttachment: boolean;
  deductsBalance: boolean;
  allowsHalfDay: boolean;
  isActive: boolean;
}

export interface AbsenceRequest {
  id: string;
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  startPeriod: AbsenceDayPeriod;
  endPeriod: AbsenceDayPeriod;
  totalDays: number;
  reason: string;
  status: AbsenceRequestStatus;
  requestedVia: AbsenceRequestedVia;
  sourceMessageSid: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AbsenceRequestEvent {
  id: string;
  absenceRequestId: string;
  eventType: string;
  oldStatus: AbsenceRequestStatus | null;
  newStatus: AbsenceRequestStatus | null;
  performedByUserId: string | null;
  performedByEmployeeId: string | null;
  comment: string | null;
  createdAt: string;
  performerName?: string | null;
}

export interface AbsenceRequestListItem extends AbsenceRequest {
  employee: {
    id: string;
    name: string;
    phoneNumber: string;
    active: boolean;
  };
  absenceType: {
    id: string;
    code: string;
    name: string;
  };
  reviewerName?: string | null;
  affectedInventoriesCount: number;
}

export interface AffectedInventoryWarning {
  inventoryId: string;
  storeId: string;
  storeName: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  status: string;
}

export interface AbsenceRequestDetail extends AbsenceRequestListItem {
  events: AbsenceRequestEvent[];
  affectedInventories: AffectedInventoryWarning[];
}

export interface AbsenceRequestFilters {
  page?: number;
  limit?: number;
  status?: AbsenceRequestStatus;
  absenceTypeId?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CreateAbsenceRequestInput {
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  startPeriod?: AbsenceDayPeriod;
  endPeriod?: AbsenceDayPeriod;
  reason: string;
  requestedVia?: AbsenceRequestedVia;
}
