import { useCallback, useEffect, useRef, useState } from "react";
import { LANDING_MOBILE_MEDIA_QUERY } from "../constants/responsive";
import { useInView } from "../hooks/useInView";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

function WhatsAppBrandIcon() {
  return (
    <svg
      className={classes.waBrandIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 2.09.61 4.03 1.66 5.66L2 22l4.58-1.75a9.86 9.86 0 0 0 5.46 1.64h.01c5.46 0 9.91-4.45 9.91-9.91C22 6.45 17.55 2 12.04 2zm0 18.08h-.01a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-2.72 1.04.99-2.65-.19-.31a8.08 8.08 0 0 1-1.24-4.32c0-4.47 3.64-8.11 8.12-8.11s8.12 3.64 8.12 8.11-3.65 8.11-8.12 8.11z"
      />
      <path
        fill="currentColor"
        d="M16.52 14.05c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.48-.4-.42-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.52.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z"
      />
    </svg>
  );
}

type WhatsAppDemoPhase =
  | "idle"
  | "typing-assignment"
  | "assignment"
  | "typing-question"
  | "question"
  | "actions"
  | "highlight"
  | "confirmed"
  | "registered"
  | "syncing"
  | "complete";

const CYCLE_MS = 9000;
const MOBILE_CYCLE_MS = 5200;
const MANUAL_PAUSE_MS = CYCLE_MS;
const MOBILE_MANUAL_PAUSE_MS = MOBILE_CYCLE_MS;

const PHASE_MARKS: { phase: WhatsAppDemoPhase; at: number }[] = [
  { phase: "idle", at: 0 },
  { phase: "typing-assignment", at: 500 },
  { phase: "assignment", at: 1300 },
  { phase: "typing-question", at: 2200 },
  { phase: "question", at: 3000 },
  { phase: "actions", at: 3800 },
  { phase: "highlight", at: 4400 },
  { phase: "confirmed", at: 5000 },
  { phase: "registered", at: 5400 },
  { phase: "syncing", at: 5800 },
  { phase: "complete", at: 6500 },
];

const MOBILE_PHASE_MARKS: { phase: WhatsAppDemoPhase; at: number }[] = [
  { phase: "assignment", at: 0 },
  { phase: "question", at: 450 },
  { phase: "actions", at: 900 },
  { phase: "highlight", at: 1200 },
  { phase: "confirmed", at: 1500 },
  { phase: "registered", at: 1800 },
  { phase: "syncing", at: 2100 },
  { phase: "complete", at: 2600 },
];

const PHASE_ORDER = PHASE_MARKS.map((item) => item.phase);

function phaseIndex(phase: WhatsAppDemoPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

function atLeast(current: WhatsAppDemoPhase, target: WhatsAppDemoPhase): boolean {
  return phaseIndex(current) >= phaseIndex(target);
}

export function WhatsAppSection() {
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useMediaQuery(LANDING_MOBILE_MEDIA_QUERY);
  const { ref: sectionRef, inView } = useInView<HTMLElement>({ threshold: 0.25, once: false });
  const phaseMarks = isMobile ? MOBILE_PHASE_MARKS : PHASE_MARKS;
  const cycleMs = isMobile ? MOBILE_CYCLE_MS : CYCLE_MS;
  const manualPauseMs = isMobile ? MOBILE_MANUAL_PAUSE_MS : MANUAL_PAUSE_MS;
  const [phase, setPhase] = useState<WhatsAppDemoPhase>(reducedMotion ? "complete" : "idle");
  const [opsSynced, setOpsSynced] = useState(reducedMotion);
  const [syncGlow, setSyncGlow] = useState(false);
  const manualLockRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const runSync = useCallback(() => {
    setSyncGlow(true);
    const glowId = window.setTimeout(() => setSyncGlow(false), 900);
    timersRef.current.push(glowId);
    setOpsSynced(true);
  }, []);

  const resetCycle = useCallback(() => {
    setPhase("idle");
    setOpsSynced(false);
    setSyncGlow(false);
  }, []);

  const jumpToConfirmed = useCallback(() => {
    clearTimers();
    setPhase("confirmed");
    window.setTimeout(() => setPhase("registered"), 350);
    window.setTimeout(() => {
      setPhase("syncing");
      runSync();
    }, 700);
    window.setTimeout(() => setPhase("complete"), 1100);
  }, [clearTimers, runSync]);

  const loopStarterRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (reducedMotion) {
      clearTimers();
      loopStarterRef.current = () => {};
      return;
    }

    if (!inView) {
      clearTimers();
      loopStarterRef.current = () => {};
      return;
    }

    const startLoop = () => {
      if (manualLockRef.current) {
        return;
      }
      clearTimers();
      resetCycle();

      phaseMarks.forEach(({ phase: nextPhase, at }) => {
        const id = window.setTimeout(() => {
          if (manualLockRef.current) {
            return;
          }
          setPhase(nextPhase);
          if (nextPhase === "syncing") {
            runSync();
          }
        }, at);
        timersRef.current.push(id);
      });

      const resetId = window.setTimeout(() => {
        if (!manualLockRef.current && inView) {
          startLoop();
        }
      }, cycleMs);
      timersRef.current.push(resetId);
    };

    loopStarterRef.current = startLoop;
    startLoop();
    return () => {
      clearTimers();
      loopStarterRef.current = () => {};
    };
  }, [clearTimers, cycleMs, inView, phaseMarks, reducedMotion, resetCycle, runSync]);

  const handleConfirm = () => {
    manualLockRef.current = true;
    jumpToConfirmed();
    window.setTimeout(() => {
      manualLockRef.current = false;
      if (!reducedMotion) {
        loopStarterRef.current();
      }
    }, manualPauseMs);
  };

  const showTypingAssignment = !isMobile && phase === "typing-assignment";
  const showTypingQuestion = !isMobile && phase === "typing-question";
  const showAssignment =
    reducedMotion || atLeast(phase, "assignment");
  const showQuestion = reducedMotion || atLeast(phase, "question");
  const showActions = reducedMotion || atLeast(phase, "actions");
  const showUserReply = reducedMotion || atLeast(phase, "confirmed");
  const showRegistered = reducedMotion || atLeast(phase, "registered");
  const highlightConfirm = phase === "highlight";

  return (
    <section
      ref={sectionRef}
      className={`${shared.section} ${classes.whatsappSection}`}
      aria-labelledby="whatsapp-title"
      data-testid="whatsapp-section"
      data-mobile-layout={isMobile ? "compact" : "default"}
    >
      <div className={`${shared.sectionInner} ${classes.whatsappSplit}`}>
        <div className={classes.whatsappCopyCol}>
          <h2 id="whatsapp-title" className={classes.whatsappTitle}>
            Simple para ellos.
            <br />
            Control para vos.
          </h2>
          <p className={classes.whatsappLead}>
            Confirmaciones, avisos y cambios directamente por WhatsApp.
          </p>
          <p className={classes.whatsappBody}>
            Cada colaborador recibe lo que necesita en su celular. Vos ves el estado de toda la operación en
            tiempo real.
          </p>
          <ul className={classes.whatsappBenefits}>
            <li>Sin instalar otra app</li>
            <li>Confirmaciones desde WhatsApp</li>
            <li>Estado actualizado en Operations</li>
          </ul>
        </div>

        <div
          className={classes.whatsappDeviceStage}
          data-testid="whatsapp-device-stage"
          data-synced={opsSynced ? "true" : "false"}
          data-glow={syncGlow ? "true" : "false"}
        >
          <div
            className={`${classes.phoneDevice} ${isMobile ? classes.phoneDeviceCompact : ""}`}
            data-testid="whatsapp-phone"
          >
            <div className={classes.phoneSpeaker} aria-hidden="true" />
            <div className={classes.phoneNotch} aria-hidden="true" />
            <div className={classes.phoneScreen}>
              <div className={classes.waChatHeader}>
                <button type="button" className={classes.waHeaderBack} aria-hidden="true" tabIndex={-1}>
                  ←
                </button>
                <span className={classes.waHeaderAvatar} aria-label="WhatsApp">
                  <WhatsAppBrandIcon />
                </span>
                <div className={classes.waHeaderMeta}>
                  <strong>Dinamic Operations</strong>
                  <span>en línea</span>
                </div>
                <span className={classes.waHeaderActions} aria-hidden="true">⋮</span>
              </div>
              <div className={classes.waChatBody}>
                {showTypingAssignment ? (
                  <div className={classes.waTyping} aria-hidden="true">
                    <span className={classes.waTypingDots}>
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                ) : null}
                {showAssignment ? (
                  <div
                    className={classes.waBubble}
                    data-in="true"
                    data-testid="whatsapp-assignment"
                  >
                    Mañana tenés asignado:
                    <br />
                    Oficina Central
                    <br />
                    08:00–16:00
                  </div>
                ) : null}
                {showTypingQuestion ? (
                  <div className={classes.waTyping} aria-hidden="true">
                    <span className={classes.waTypingDots}>
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                ) : null}
                {showQuestion ? (
                  <div className={classes.waBubble} data-in="true">
                    ¿Confirmás tu asistencia?
                  </div>
                ) : null}
                {showActions ? (
                  <div className={classes.waActions}>
                    <button
                      type="button"
                      className={classes.waBtn}
                      data-primary="true"
                      data-highlight={highlightConfirm ? "true" : "false"}
                      data-confirmed={showUserReply ? "true" : "false"}
                      onClick={handleConfirm}
                    >
                      {showUserReply ? "✓ Confirmado" : "Confirmar"}
                    </button>
                    <button type="button" className={classes.waBtn} disabled tabIndex={-1}>
                      No puedo asistir
                    </button>
                  </div>
                ) : null}
                {showUserReply ? (
                  <div className={classes.waBubble} data-out="true">
                    Confirmo ✓
                  </div>
                ) : null}
                {showRegistered && !isMobile ? (
                  <p className={classes.waStatusNote} aria-hidden="true">Confirmación registrada</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
