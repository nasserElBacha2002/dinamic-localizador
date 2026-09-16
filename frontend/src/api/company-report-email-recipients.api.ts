import type {
  CompanyReportEmailRecipient,
  CreateCompanyReportEmailRecipientInput,
  UpdateCompanyReportEmailRecipientInput,
} from "../types/company-report-email-recipient";
import { scopedApiClient } from "./scoped-client";

export async function listCompanyReportEmailRecipients(): Promise<CompanyReportEmailRecipient[]> {
  const { data } = await scopedApiClient.get<{ data: CompanyReportEmailRecipient[] }>(
    "company-report-email-recipients",
  );
  return data.data;
}

export async function createCompanyReportEmailRecipient(
  input: CreateCompanyReportEmailRecipientInput,
): Promise<CompanyReportEmailRecipient> {
  const { data } = await scopedApiClient.post<{ data: CompanyReportEmailRecipient }>(
    "company-report-email-recipients",
    input,
  );
  return data.data;
}

export async function updateCompanyReportEmailRecipient(
  recipientId: string,
  input: UpdateCompanyReportEmailRecipientInput,
): Promise<CompanyReportEmailRecipient> {
  const { data } = await scopedApiClient.patch<{ data: CompanyReportEmailRecipient }>(
    `company-report-email-recipients/${recipientId}`,
    input,
  );
  return data.data;
}

export async function deleteCompanyReportEmailRecipient(recipientId: string): Promise<void> {
  await scopedApiClient.delete(`company-report-email-recipients/${recipientId}`);
}
