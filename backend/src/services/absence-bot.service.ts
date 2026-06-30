import type { BotSession } from "../types/twilio.types";
import type { AbsenceType } from "../types/absence";
import { AppError } from "../errors/app-error";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { absenceRequestService } from "./absence-request.service";
import { botSessionService } from "./bot-session.service";
import {
  detectAbsenceTypeCode,
  isAbsenceCancelIntent,
  isAffirmativeConfirmation,
  isNegativeConfirmation,
} from "../utils/absence-intent";
import {
  calculateTotalAbsenceDays,
  formatAbsenceDateDisplay,
  parseSpanishDateInput,
} from "../utils/absence-date";
import { isAbsenceSessionState, isCheckInSessionState, isCheckoutSessionState } from "../utils/bot-session-states";

type RespondFn = (input: {
  message: string;
  employeeId: string | null;
  phoneFrom: string;
  phoneTo: string;
}) => Promise<string>;

const INVALID_DATE_MESSAGE =
  "No pude interpretar la fecha. Usá el formato DD/MM/AAAA, por ejemplo 05/07/2026.";

const buildTypeSelectionPrompt = (types: AbsenceType[]): string => {
  const lines = types.map((type, index) => `${index + 1}. ${type.name}`);
  return `Seleccioná el tipo de ausencia respondiendo con el número:\n\n${lines.join("\n")}`;
};

const parseTypeSelection = (body: string, types: AbsenceType[]): AbsenceType | null => {
  const trimmed = body.trim();
  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10) - 1;
    return types[index] ?? null;
  }

  const normalized = trimmed.toLowerCase();
  return (
    types.find((type) => type.name.toLowerCase() === normalized || type.code.toLowerCase() === normalized) ??
    null
  );
};

const buildSummary = (input: {
  typeName: string;
  startDate: string;
  endDate: string;
  reason: string;
  totalDays: number;
}): string =>
  [
    "Resumen de tu solicitud de ausencia:",
    `Tipo: ${input.typeName}`,
    `Desde: ${formatAbsenceDateDisplay(input.startDate)}`,
    `Hasta: ${formatAbsenceDateDisplay(input.endDate)}`,
    `Días: ${input.totalDays}`,
    `Motivo: ${input.reason}`,
    "",
    "¿Confirmás la solicitud? Respondé SI o NO.",
  ].join("\n");

const serializeContext = (context: ReturnType<typeof botSessionService.parseContext>) =>
  JSON.stringify(context);

export const absenceBotService = {
  hasActiveAttendanceSession(session: BotSession | null): boolean {
    return Boolean(session && (isCheckInSessionState(session.state) || isCheckoutSessionState(session.state)));
  },

  async startAbsenceFlow(input: {
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
    body: string;
    respond: RespondFn;
  }): Promise<string> {
    const types = await absenceTypeRepository.listActive();
    const detectedCode = detectAbsenceTypeCode(input.body);
    const draft = {
      flow: "ABSENCE_REQUEST" as const,
      absenceDraft: {} as NonNullable<ReturnType<typeof botSessionService.parseContext>["absenceDraft"]>,
    };

    if (detectedCode && detectedCode !== "GENERIC" && detectedCode !== "OTHER") {
      const absenceType = types.find((type) => type.code === detectedCode) ?? null;
      if (absenceType) {
        draft.absenceDraft.absenceTypeId = absenceType.id;
        draft.absenceDraft.absenceTypeCode = absenceType.code;
        await botSessionService.createAbsenceSession({
          employeeId: input.employeeId,
          phoneNumber: input.phoneFrom,
          state: "WAITING_ABSENCE_START_DATE",
          contextJson: serializeContext(draft),
        });
        return input.respond({
          message: `Perfecto. Ingresá la fecha de inicio de tu ausencia (${absenceType.name}) en formato DD/MM/AAAA.\nPor ejemplo: 05/07/2026.`,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
    }

    await botSessionService.createAbsenceSession({
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      state: "WAITING_ABSENCE_TYPE",
      contextJson: serializeContext(draft),
    });

    return input.respond({
      message: buildTypeSelectionPrompt(types),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async handleAbsenceSession(input: {
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
    messageSid: string;
    respond: RespondFn;
  }): Promise<string> {
    if (isAbsenceCancelIntent(input.body)) {
      await botSessionService.cancelSession(input.session.id);
      return input.respond({
        message: "Solicitud de ausencia cancelada. Si necesitás algo más, escribinos.",
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const context = botSessionService.parseContext(input.session.contextJson);
    const draft = context.absenceDraft ?? {};

    if (input.session.state === "WAITING_ABSENCE_TYPE") {
      const types = await absenceTypeRepository.listActive();
      const selected = parseTypeSelection(input.body, types);
      if (!selected) {
        return input.respond({
          message: `Opción inválida.\n\n${buildTypeSelectionPrompt(types)}`,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      draft.absenceTypeId = selected.id;
      draft.absenceTypeCode = selected.code;
      await botSessionService.updateAbsenceSession(input.session.id, {
        state: "WAITING_ABSENCE_START_DATE",
        contextJson: serializeContext({ ...context, absenceDraft: draft }),
      });

      return input.respond({
        message: "Ingresá la fecha de inicio en formato DD/MM/AAAA.\nPor ejemplo: 05/07/2026.",
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (input.session.state === "WAITING_ABSENCE_START_DATE") {
      const parsed = parseSpanishDateInput(input.body);
      if (!parsed) {
        return input.respond({
          message: INVALID_DATE_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      draft.startDate = parsed.iso;
      await botSessionService.updateAbsenceSession(input.session.id, {
        state: "WAITING_ABSENCE_END_DATE",
        contextJson: serializeContext({ ...context, absenceDraft: draft }),
      });

      return input.respond({
        message:
          "Ingresá la fecha de fin en formato DD/MM/AAAA.\nPor ejemplo: 05/07/2026. Si es un solo día, repetí la misma fecha.",
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (input.session.state === "WAITING_ABSENCE_END_DATE") {
      const parsed = parseSpanishDateInput(input.body);
      if (!parsed) {
        return input.respond({
          message: INVALID_DATE_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      draft.endDate = parsed.iso;
      await botSessionService.updateAbsenceSession(input.session.id, {
        state: "WAITING_ABSENCE_REASON",
        contextJson: serializeContext({ ...context, absenceDraft: draft }),
      });

      return input.respond({
        message: "Contanos brevemente el motivo de la ausencia.",
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (input.session.state === "WAITING_ABSENCE_REASON") {
      const reason = input.body.trim();
      if (reason.length < 3) {
        return input.respond({
          message: "El motivo debe tener al menos 3 caracteres.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      draft.reason = reason;
      const absenceType = draft.absenceTypeId
        ? await absenceTypeRepository.findById(draft.absenceTypeId)
        : null;

      const totalDays = calculateTotalAbsenceDays({
        startDate: draft.startDate!,
        endDate: draft.endDate!,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
      });

      await botSessionService.updateAbsenceSession(input.session.id, {
        state: "WAITING_ABSENCE_CONFIRMATION",
        contextJson: serializeContext({ ...context, absenceDraft: draft }),
      });

      return input.respond({
        message: buildSummary({
          typeName: absenceType?.name ?? "Ausencia",
          startDate: draft.startDate!,
          endDate: draft.endDate!,
          reason: draft.reason,
          totalDays,
        }),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (input.session.state === "WAITING_ABSENCE_CONFIRMATION") {
      if (isNegativeConfirmation(input.body)) {
        await botSessionService.cancelSession(input.session.id);
        return input.respond({
          message: "Solicitud de ausencia cancelada.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      if (!isAffirmativeConfirmation(input.body)) {
        return input.respond({
          message: 'Respondé SI para confirmar o NO para cancelar.',
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      if (!draft.absenceTypeId || !draft.startDate || !draft.endDate || !draft.reason) {
        await botSessionService.cancelSession(input.session.id);
        return input.respond({
          message: "No pudimos completar la solicitud. Iniciá nuevamente escribiendo que querés pedir una ausencia.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      try {
        const { isExisting } = await absenceRequestService.createFromWhatsapp({
          employeeId: input.employeeId,
          absenceTypeId: draft.absenceTypeId,
          startDate: draft.startDate,
          endDate: draft.endDate,
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          reason: draft.reason,
          sourceMessageSid: input.messageSid,
        });

        await botSessionService.completeSession(input.session.id);
        return input.respond({
          message: isExisting
            ? "Tu solicitud de ausencia ya había sido registrada y quedó pendiente de revisión."
            : "Tu solicitud de ausencia fue registrada y quedó pendiente de revisión por administración.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      } catch (error) {
        await botSessionService.cancelSession(input.session.id);
        const message =
          error instanceof AppError
            ? error.message
            : "No pudimos registrar la solicitud.";
        return input.respond({
          message: `No pudimos registrar la solicitud: ${message}`,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
    }

    return input.respond({
      message: "No pudimos continuar con la solicitud de ausencia.",
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  isAbsenceSessionState,
};
