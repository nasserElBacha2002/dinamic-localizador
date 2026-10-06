import { useCallback, useEffect, useRef, useState } from "react";
import { LANDING_MOBILE_MEDIA_QUERY } from "../constants/responsive";
import { useInView } from "../hooks/useInView";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { DinamicIsotype } from "../brand/DinamicIsotype";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

function WaTypingIndicator({ outbound = false }: { outbound?: boolean }) {
  return (
    <div className={classes.waTyping} data-out={outbound ? "true" : "false"} aria-hidden="true">
      <span className={classes.waTypingDots}>
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

type WhatsAppDemoPhase =
  | "idle"
  | "typing-assignment"
  | "assignment"
  | "typing-question"
  | "question"
  | "typing-user"
  | "location"
  | "typing-registered"
  | "registered"
  | "complete";

const CYCLE_MS = 10200;
const MOBILE_CYCLE_MS = 5600;
const MANUAL_PAUSE_MS = CYCLE_MS;
const MOBILE_MANUAL_PAUSE_MS = MOBILE_CYCLE_MS;

const PHASE_MARKS: { phase: WhatsAppDemoPhase; at: number }[] = [
  { phase: "idle", at: 0 },
  { phase: "typing-assignment", at: 450 },
  { phase: "assignment", at: 1450 },
  { phase: "typing-question", at: 2450 },
  { phase: "question", at: 3450 },
  { phase: "typing-user", at: 4300 },
  { phase: "location", at: 5100 },
  { phase: "typing-registered", at: 5750 },
  { phase: "registered", at: 6550 },
  { phase: "complete", at: 7400 },
];

const MOBILE_PHASE_MARKS: { phase: WhatsAppDemoPhase; at: number }[] = [
  { phase: "typing-assignment", at: 0 },
  { phase: "assignment", at: 750 },
  { phase: "typing-question", at: 1350 },
  { phase: "question", at: 2050 },
  { phase: "typing-user", at: 2650 },
  { phase: "location", at: 3250 },
  { phase: "typing-registered", at: 3750 },
  { phase: "registered", at: 4350 },
  { phase: "complete", at: 5000 },
];

const PHASE_ORDER = PHASE_MARKS.map((item) => item.phase);

function phaseIndex(phase: WhatsAppDemoPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

function atLeast(current: WhatsAppDemoPhase, target: WhatsAppDemoPhase): boolean {
  return phaseIndex(current) >= phaseIndex(target);
}

function isBotTypingPhase(phase: WhatsAppDemoPhase): boolean {
  return phase === "typing-assignment" || phase === "typing-question" || phase === "typing-registered";
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
  const manualLockRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const markSynced = useCallback(() => {
    setOpsSynced(true);
  }, []);

  const resetCycle = useCallback(() => {
    setPhase("idle");
    setOpsSynced(false);
  }, []);

  const schedulePhase = useCallback(
    (nextPhase: WhatsAppDemoPhase, delayMs: number) => {
      const id = window.setTimeout(() => setPhase(nextPhase), delayMs);
      timersRef.current.push(id);
    },
    [],
  );

  const jumpToCheckedIn = useCallback(() => {
    clearTimers();
    setPhase("typing-user");
    schedulePhase("location", 700);
    schedulePhase("typing-registered", 1200);
    schedulePhase("registered", 1900);
    const syncId = window.setTimeout(() => markSynced(), 1900);
    timersRef.current.push(syncId);
    schedulePhase("complete", 2600);
  }, [clearTimers, markSynced, schedulePhase]);

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
          if (nextPhase === "registered") {
            markSynced();
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
  }, [clearTimers, cycleMs, inView, markSynced, phaseMarks, reducedMotion, resetCycle]);

  const handleShareLocation = () => {
    manualLockRef.current = true;
    jumpToCheckedIn();
    window.setTimeout(() => {
      manualLockRef.current = false;
      if (!reducedMotion) {
        loopStarterRef.current();
      }
    }, manualPauseMs);
  };

  const showTypingAssignment = !reducedMotion && phase === "typing-assignment";
  const showTypingQuestion = !reducedMotion && phase === "typing-question";
  const showTypingUser = !reducedMotion && phase === "typing-user";
  const showTypingRegistered = !reducedMotion && phase === "typing-registered";
  const showAssignment = reducedMotion || atLeast(phase, "assignment");
  const showQuestion = reducedMotion || atLeast(phase, "question");
  const showLocationShare = reducedMotion || atLeast(phase, "location");
  const showRegistered = reducedMotion || atLeast(phase, "registered");
  const headerStatus = !reducedMotion && isBotTypingPhase(phase) ? "escribiendo…" : "en línea";
  const composerBusy = !reducedMotion && phase === "typing-user";

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
            Fichaje con ubicación, avisos y cambios directamente por WhatsApp.
          </p>
          <p className={classes.whatsappBody}>
            Cada colaborador recibe lo que necesita en su celular. Vos ves el estado de toda la operación en
            tiempo real.
          </p>
          <ul className={classes.whatsappBenefits}>
            <li>Sin instalar otra app</li>
            <li>Fichaje con ubicación desde WhatsApp</li>
            <li>Estado actualizado en Operations</li>
          </ul>
        </div>

        <div
          className={classes.whatsappDeviceStage}
          data-testid="whatsapp-device-stage"
          data-synced={opsSynced ? "true" : "false"}
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
                <span className={classes.waHeaderAvatar} aria-hidden="true">
                  <DinamicIsotype className={classes.waBrandIcon} />
                </span>
                <div className={classes.waHeaderMeta}>
                  <strong>Dinamic Operations</strong>
                  <span>{headerStatus}</span>
                </div>
                <span className={classes.waHeaderActions} aria-hidden="true">⋮</span>
              </div>
              <div className={classes.waChatBody}>
                {showAssignment ? (
                  <div
                    className={classes.waBubble}
                    data-in="true"
                    data-testid="whatsapp-assignment"
                  >
                    Jornada en curso:
                    <br />
                    Oficina Central
                    <br />
                    08:00–16:00
                  </div>
                ) : null}
                {showQuestion ? (
                  <div className={classes.waBubble} data-in="true">
                    Compartí tu ubicación actual para registrar tu llegada.
                  </div>
                ) : null}
                {showLocationShare ? (
                  <div
                    className={`${classes.waBubble} ${classes.waLocationBubble}`}
                    data-out="true"
                    data-testid="whatsapp-location-share"
                  >
                    <span className={classes.waLocationTitle}>📍 Ubicación actual</span>
                    <div className={classes.waLocationMap} aria-hidden="true" />
                    <span className={classes.waLocationCaption}>Oficina Central</span>
                  </div>
                ) : null}
                {showRegistered ? (
                  <div className={classes.waBubble} data-in="true" data-testid="whatsapp-arrival-registered">
                    Tu llegada fue registrada correctamente.
                  </div>
                ) : null}
                {showTypingAssignment ? <WaTypingIndicator /> : null}
                {showTypingQuestion ? <WaTypingIndicator /> : null}
                {showTypingUser ? <WaTypingIndicator outbound /> : null}
                {showTypingRegistered ? <WaTypingIndicator /> : null}
              </div>
              <div className={classes.waChatFooter}>
                <button
                  type="button"
                  className={classes.waComposerAttach}
                  aria-label="Compartir ubicación"
                  onClick={handleShareLocation}
                >
                  📎
                </button>
                <div
                  className={classes.waComposerField}
                  data-busy={composerBusy ? "true" : "false"}
                  aria-hidden="true"
                >
                  {composerBusy ? (
                    <span className={classes.waComposerTyping}>
                      <span className={classes.waComposerCaret} />
                    </span>
                  ) : (
                    <span className={classes.waComposerPlaceholder}>Mensaje</span>
                  )}
                </div>
                <button type="button" className={classes.waComposerMic} aria-hidden="true" tabIndex={-1}>
                  🎤
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
