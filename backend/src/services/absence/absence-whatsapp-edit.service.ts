import type { BotSession } from "../../types/twilio.types";
import { AppError } from "../../errors/app-error";
import { absenceRequestRepository } from "../../repositories/absence/absence-request.repository";
import { absenceRequestService } from "./absence-request.service";
import { botSessionService } from "../bot/bot-session.service";
import {
  isAffirmativeConfirmation,
  isNegativeConfirmation,
} from "../../utils/absence/absence-intent";
import { formatAbsenceDateDisplay } from "../../utils/absence-date";
import { parseSpanishDateInput } from "../bot/bot-date.parser";

type RespondFn = (input: {
  message: string;
  employeeId: string | null;
  phoneFrom: string;
  phoneTo: string;
}) => Promise<string>;

const INVALID_DATE_MESSAGE =
  "No pude interpretar la fecha. Usá el formato DD/MM/AAAA, por ejemplo 05/07/2026.";

const serializeContext = (context: ReturnType<typeof botSessionService.parseContext>) =>
  JSON.stringify(context);

const formatRequestLine = (
  index: number,
  row: {
    absenceTypeName: string;
    startDate: string;
    endDate: string;
    status: string;
  },
): string =>
  `${index + 1}. ${row.absenceTypeName} — ${formatAbsenceDateDisplay(row.startDate)} al ${formatAbsenceDateDisplay(row.endDate)} — ${row.status}`;

export const absenceWhatsappEditService = {
  isEditSession(session: BotSession): boolean {
    const context = botSessionService.parseContext(session.contextJson);
    return (
      context.flow === "ABSENCE_EDIT" ||
      context.flow === "ABSENCE_OVERLAP_PROMPT" ||
      session.state.startsWith("WAITING_ABSENCE_EDIT_") ||
      session.state === "WAITING_ABSENCE_OVERLAP_PROMPT"
    );
  },

  async startOverlapPromptAfterCreate(
    companyId: string,
    input: {
      session: BotSession;
      employeeId: string;
      phoneFrom: string;
      phoneTo: string;
      overlappingRequestId: string;
      respond: RespondFn;
    },
  ): Promise<string> {
    const detail = await absenceRequestService.getById(companyId, input.overlappingRequestId);
    await botSessionService.updateAbsenceSession(companyId, input.session.id, {
      state: "WAITING_ABSENCE_OVERLAP_PROMPT",
      contextJson: serializeContext({
        flow: "ABSENCE_OVERLAP_PROMPT",
        absenceDraft: {
          requestId: detail.id,
          startDate: detail.startDate,
          endDate: detail.endDate,
          reason: detail.reason,
        },
      }),
    });
    return input.respond({
      message: [
        "Ya tenés una solicitud pendiente para esas fechas. ¿Querés modificarla?",
        "",
        `Actual: ${formatAbsenceDateDisplay(detail.startDate)} al ${formatAbsenceDateDisplay(detail.endDate)}`,
        "",
        "1. Modificar solicitud",
        "2. Ver solicitud",
        "3. Cancelar",
      ].join("\n"),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async startEditFlow(
    companyId: string,
    input: {
      employeeId: string;
      phoneFrom: string;
      phoneTo: string;
      respond: RespondFn;
      kindSelectionSession?: BotSession | null;
    },
  ): Promise<string> {
    const editable = await absenceRequestRepository.listEmployeeEditableRequests(
      companyId,
      input.employeeId,
    );
    if (editable.length === 0) {
      if (input.kindSelectionSession) {
        await botSessionService.cancelSession(
          companyId,
          input.kindSelectionSession.id,
          input.kindSelectionSession,
        );
      }
      return input.respond({
        message: "No tenés solicitudes pendientes que puedas modificar.",
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const persistEditSession = async (
      state: BotSession["state"],
      contextJson: string,
    ): Promise<void> => {
      if (input.kindSelectionSession) {
        const updated = await botSessionService.updateAbsenceSession(
          companyId,
          input.kindSelectionSession.id,
          { state, contextJson },
        );
        if (!updated) {
          await botSessionService.createAbsenceSession(companyId, {
            employeeId: input.employeeId,
            phoneNumber: input.phoneFrom,
            state,
            contextJson,
          });
        }
        return;
      }
      await botSessionService.createAbsenceSession(companyId, {
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        state,
        contextJson,
      });
    };

    try {
      if (editable.length === 1) {
        await persistEditSession(
          "WAITING_ABSENCE_EDIT_FIELD_MENU",
          serializeContext({
            flow: "ABSENCE_EDIT",
            absenceDraft: {
              requestId: editable[0].id,
              absenceTypeId: undefined,
              startDate: editable[0].startDate,
              endDate: editable[0].endDate,
              reason: editable[0].reason,
            },
          }),
        );
        return this.promptFieldMenu(input, editable[0]);
      }

      await persistEditSession(
        "WAITING_ABSENCE_EDIT_REQUEST_SELECTION",
        serializeContext({
          flow: "ABSENCE_EDIT",
          absenceEditOptions: editable.map((row) => row.id),
        }),
      );
    } catch (error) {
      console.error("[absence-whatsapp-edit] failed to persist edit session", {
        employeeId: input.employeeId,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
      return input.respond({
        message:
          "No pude iniciar la modificación de la solicitud. Intentá de nuevo en un momento.",
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const lines = editable.map((row, index) => formatRequestLine(index, row));
    return input.respond({
      message: ["Elegí la solicitud a modificar:", "", ...lines, "", "Respondé con el número."].join(
        "\n",
      ),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  promptFieldMenu(
    input: {
      employeeId: string;
      phoneFrom: string;
      phoneTo: string;
      respond: RespondFn;
    },
    row: { startDate: string; endDate: string; reason: string },
  ): Promise<string> {
    return input.respond({
      message: [
        "Tu solicitud actual:",
        `Desde: ${formatAbsenceDateDisplay(row.startDate)}`,
        `Hasta: ${formatAbsenceDateDisplay(row.endDate)}`,
        `Motivo: ${row.reason}`,
        "",
        "¿Qué querés modificar?",
        "1. Fecha desde",
        "2. Fecha hasta",
        "3. Motivo",
        "4. Todo",
        "5. Cancelar",
      ].join("\n"),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async handleEditSession(
    companyId: string,
    input: {
      session: BotSession;
      body: string;
      employeeId: string;
      phoneFrom: string;
      phoneTo: string;
      messageSid: string;
      respond: RespondFn;
    },
  ): Promise<string> {
    const context = botSessionService.parseContext(input.session.contextJson);
    const draft = context.absenceDraft ?? {};

    if (input.session.state === "WAITING_ABSENCE_OVERLAP_PROMPT") {
      const choice = input.body.trim();
      if (choice === "3" || isNegativeConfirmation(input.body)) {
        await botSessionService.cancelSession(companyId, input.session.id, input.session);
        return input.respond({
          message: "Ok, no modificamos la solicitud existente.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      if (choice === "2") {
        if (!draft.requestId) {
          return input.respond({
            message: "No encontramos la solicitud. Intentá de nuevo más tarde.",
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }
        const detail = await absenceRequestService.getById(companyId, draft.requestId);
        return input.respond({
          message: [
            "Tu solicitud pendiente:",
            `Desde: ${formatAbsenceDateDisplay(detail.startDate)}`,
            `Hasta: ${formatAbsenceDateDisplay(detail.endDate)}`,
            `Motivo: ${detail.reason}`,
            `Estado: ${detail.status}`,
          ].join("\n"),
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      if (choice === "1") {
        if (!draft.requestId) {
          return input.respond({
            message: "No encontramos la solicitud para modificar.",
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }
        const detail = await absenceRequestService.getById(companyId, draft.requestId);
        draft.startDate = detail.startDate;
        draft.endDate = detail.endDate;
        draft.reason = detail.reason;
        await botSessionService.updateAbsenceSession(companyId, input.session.id, {
          state: "WAITING_ABSENCE_EDIT_FIELD_MENU",
          contextJson: serializeContext({ flow: "ABSENCE_EDIT", absenceDraft: draft }),
        });
        return this.promptFieldMenu(input, {
          startDate: detail.startDate,
          endDate: detail.endDate,
          reason: detail.reason,
        });
      }
      return input.respond({
        message: "Respondé 1 para modificar, 2 para ver la solicitud o 3 para cancelar.",
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (input.session.state === "WAITING_ABSENCE_EDIT_REQUEST_SELECTION") {
      const selection = Number.parseInt(input.body.trim(), 10);
      const ids = context.absenceEditOptions ?? [];
      const requestId = Number.isFinite(selection) ? ids[selection - 1] : undefined;
      if (!requestId) {
        return input.respond({
          message: "Opción inválida. Respondé con el número de la solicitud.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      const detail = await absenceRequestService.getById(companyId, requestId);
      draft.requestId = detail.id;
      draft.startDate = detail.startDate;
      draft.endDate = detail.endDate;
      draft.reason = detail.reason;
      await botSessionService.updateAbsenceSession(companyId, input.session.id, {
        state: "WAITING_ABSENCE_EDIT_FIELD_MENU",
        contextJson: serializeContext({ ...context, flow: "ABSENCE_EDIT", absenceDraft: draft }),
      });
      return this.promptFieldMenu(input, {
        startDate: detail.startDate,
        endDate: detail.endDate,
        reason: detail.reason,
      });
    }

    if (input.session.state === "WAITING_ABSENCE_EDIT_FIELD_MENU") {
      const choice = input.body.trim();
      if (choice === "5") {
        await botSessionService.cancelSession(companyId, input.session.id, input.session);
        return input.respond({
          message: "Modificación cancelada.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      const nextState =
        choice === "1"
          ? "WAITING_ABSENCE_START_DATE"
          : choice === "2"
            ? "WAITING_ABSENCE_END_DATE"
            : choice === "3"
              ? "WAITING_ABSENCE_REASON"
              : choice === "4"
                ? "WAITING_ABSENCE_START_DATE"
                : null;
      if (!nextState || !draft.requestId) {
        return input.respond({
          message: "Respondé con un número del 1 al 5.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      draft.editAll = choice === "4";
      await botSessionService.updateAbsenceSession(companyId, input.session.id, {
        state: nextState,
        contextJson: serializeContext({ ...context, flow: "ABSENCE_EDIT", absenceDraft: draft }),
      });
      if (nextState === "WAITING_ABSENCE_START_DATE") {
        return input.respond({
          message: "Ingresá la nueva fecha de inicio (DD/MM/AAAA).",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      if (nextState === "WAITING_ABSENCE_END_DATE") {
        return input.respond({
          message: "Ingresá la nueva fecha de fin (DD/MM/AAAA).",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      return input.respond({
        message: "Escribí el nuevo motivo.",
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (
      context.flow === "ABSENCE_EDIT" &&
      (input.session.state === "WAITING_ABSENCE_START_DATE" ||
        input.session.state === "WAITING_ABSENCE_END_DATE" ||
        input.session.state === "WAITING_ABSENCE_REASON")
    ) {
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
        if (draft.editAll) {
          await botSessionService.updateAbsenceSession(companyId, input.session.id, {
            state: "WAITING_ABSENCE_END_DATE",
            contextJson: serializeContext({ ...context, absenceDraft: draft }),
          });
          return input.respond({
            message: "Ingresá la nueva fecha de fin (DD/MM/AAAA).",
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }
        await botSessionService.updateAbsenceSession(companyId, input.session.id, {
          state: "WAITING_ABSENCE_EDIT_CONFIRMATION",
          contextJson: serializeContext({ ...context, absenceDraft: draft }),
        });
        return this.promptEditConfirmation(input, draft);
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
        if (draft.editAll) {
          await botSessionService.updateAbsenceSession(companyId, input.session.id, {
            state: "WAITING_ABSENCE_REASON",
            contextJson: serializeContext({ ...context, absenceDraft: draft }),
          });
          return input.respond({
            message: "Escribí el nuevo motivo.",
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }
        await botSessionService.updateAbsenceSession(companyId, input.session.id, {
          state: "WAITING_ABSENCE_EDIT_CONFIRMATION",
          contextJson: serializeContext({ ...context, absenceDraft: draft }),
        });
        return this.promptEditConfirmation(input, draft);
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
        await botSessionService.updateAbsenceSession(companyId, input.session.id, {
          state: "WAITING_ABSENCE_EDIT_CONFIRMATION",
          contextJson: serializeContext({ ...context, absenceDraft: draft }),
        });
        return this.promptEditConfirmation(input, draft);
      }
    }

    if (input.session.state === "WAITING_ABSENCE_EDIT_CONFIRMATION") {
      if (isNegativeConfirmation(input.body)) {
        await botSessionService.cancelSession(companyId, input.session.id, input.session);
        return input.respond({
          message: "Modificación cancelada.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      if (!isAffirmativeConfirmation(input.body)) {
        return input.respond({
          message: "Respondé SI para confirmar o NO para cancelar.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      if (!draft.requestId || !draft.startDate || !draft.endDate || !draft.reason) {
        throw new AppError(409, "ABSENCE_EDIT_INCOMPLETE", "Faltan datos de la modificación.");
      }
      const { detail, isExisting } = await absenceRequestService.updateFromWhatsapp(
        companyId,
        draft.requestId,
        {
          employeeId: input.employeeId,
          startDate: draft.startDate,
          endDate: draft.endDate,
          reason: draft.reason,
          sourceMessageSid: input.messageSid,
        },
      );
      await botSessionService.completeSession(
        companyId,
        input.session.id,
        undefined,
        input.session,
      );
      return input.respond({
        message: isExisting
          ? "Tu modificación ya había sido registrada."
          : `Listo. Actualizamos tu solicitud (${formatAbsenceDateDisplay(detail.startDate)} al ${formatAbsenceDateDisplay(detail.endDate)}).`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    return input.respond({
      message: "No pudimos continuar con la modificación. Intentá de nuevo desde el menú.",
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  promptEditConfirmation(
    input: {
      employeeId: string;
      phoneFrom: string;
      phoneTo: string;
      respond: RespondFn;
    },
    draft: { startDate?: string; endDate?: string; reason?: string },
  ): Promise<string> {
    return input.respond({
      message: [
        "Resumen actualizado:",
        `Desde: ${formatAbsenceDateDisplay(draft.startDate!)}`,
        `Hasta: ${formatAbsenceDateDisplay(draft.endDate!)}`,
        `Motivo: ${draft.reason}`,
        "",
        "¿Confirmás los cambios? Respondé SI o NO.",
      ].join("\n"),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },
};
