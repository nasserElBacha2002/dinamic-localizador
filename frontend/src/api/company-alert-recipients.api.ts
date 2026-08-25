import type {
  CompanyAlertRecipient,
  CreateCompanyAlertRecipientInput,
  UpdateCompanyAlertRecipientInput,
} from "../types/company-alert-recipient";
import { scopedApiClient } from "./scoped-client";

export async function listCompanyAlertRecipients(): Promise<CompanyAlertRecipient[]> {
  const { data } = await scopedApiClient.get<{ data: CompanyAlertRecipient[] }>(
    "company-alert-recipients",
  );
  return data.data;
}

export async function createCompanyAlertRecipient(
  input: CreateCompanyAlertRecipientInput,
): Promise<CompanyAlertRecipient> {
  const { data } = await scopedApiClient.post<{ data: CompanyAlertRecipient }>(
    "company-alert-recipients",
    input,
  );
  return data.data;
}

export async function updateCompanyAlertRecipient(
  recipientId: string,
  input: UpdateCompanyAlertRecipientInput,
): Promise<CompanyAlertRecipient> {
  const { data } = await scopedApiClient.patch<{ data: CompanyAlertRecipient }>(
    `company-alert-recipients/${recipientId}`,
    input,
  );
  return data.data;
}

export async function deleteCompanyAlertRecipient(recipientId: string): Promise<void> {
  await scopedApiClient.delete(`company-alert-recipients/${recipientId}`);
}
