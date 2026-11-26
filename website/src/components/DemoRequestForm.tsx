import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { trackMarketingEvent } from "../analytics/marketing-events";
import { isDemoSubmitEnabled, submitDemoRequest } from "../api/demo-request.api";
import { EMPLOYEE_COUNT_RANGES } from "../content/landing-content";
import { PRIVACY_POLICY_SEO } from "../content/privacy-policy-content";
import { marketingDemoHoneypotValue } from "./demo-request-honeypot";
import classes from "./demo-request-form.module.css";

const demoSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresá nombre y apellido"),
  company: z.string().trim().min(2, "Ingresá el nombre de la empresa"),
  email: z.string().trim().email("Ingresá un email laboral válido"),
  employeeRange: z.string().min(1, "Seleccioná un rango"),
  phone: z.string().trim().optional(),
  serviceLocations: z.string().trim().optional(),
  leadHpToken: z.string().optional(),
});

type DemoRequestFormValues = z.infer<typeof demoSchema>;

type DemoRequestFormProps = {
  id?: string;
};

type SubmitState = "idle" | "loading" | "success" | "error";

export function DemoRequestForm({ id = "solicitar-demo" }: DemoRequestFormProps) {
  const startedRef = useRef(false);
  const [honeypotTouched, setHoneypotTouched] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const statusId = useId();
  const submitEnabled = isDemoSubmitEnabled();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DemoRequestFormValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: {
      fullName: "",
      company: "",
      email: "",
      employeeRange: "",
      phone: "",
      serviceLocations: "",
      leadHpToken: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!submitEnabled || submitState === "loading") {
      return;
    }

    setSubmitState("loading");
    setSubmitError(null);

    try {
      const result = await submitDemoRequest({
        fullName: values.fullName,
        company: values.company,
        email: values.email,
        employeeRange: values.employeeRange,
        phone: values.phone?.trim() ? values.phone.trim() : undefined,
        serviceLocations: values.serviceLocations?.trim()
          ? values.serviceLocations.trim()
          : undefined,
        companyWebsite: marketingDemoHoneypotValue(values.leadHpToken, honeypotTouched),
      });
      trackMarketingEvent("demo_form_submitted", { delivered: result.delivered });
      setSubmitState("success");
      setHoneypotTouched(false);
      reset({
        fullName: "",
        company: "",
        email: "",
        employeeRange: "",
        phone: "",
        serviceLocations: "",
        leadHpToken: "",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos enviar tu solicitud. Probá de nuevo en unos minutos.";
      setSubmitState("error");
      setSubmitError(message);
    }
  });

  return (
    <div className={classes.form}>
      <form
        id={id}
        noValidate
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        onFocusCapture={() => {
          if (startedRef.current) {
            return;
          }
          startedRef.current = true;
          trackMarketingEvent("demo_form_start");
        }}
      >
        <div className={classes.hpField} aria-hidden="true">
          <label htmlFor={`${id}-leadHpToken`}>
            <input
              id={`${id}-leadHpToken`}
              tabIndex={-1}
              autoComplete="off"
              readOnly
              data-1p-ignore="true"
              data-lpignore="true"
              {...register("leadHpToken")}
              onKeyDown={() => {
                setHoneypotTouched(true);
              }}
              onPointerDown={() => {
                setHoneypotTouched(true);
              }}
            />
          </label>
        </div>

        <div className={classes.grid}>
          <label className={classes.field}>
            <span>Nombre y apellido *</span>
            <input
              autoComplete="name"
              aria-invalid={errors.fullName ? true : undefined}
              aria-describedby={errors.fullName ? `${id}-fullName-error` : undefined}
              disabled={submitState === "loading" || !submitEnabled}
              {...register("fullName")}
            />
            {errors.fullName ? (
              <span id={`${id}-fullName-error`} className={classes.error} role="alert">
                {errors.fullName.message}
              </span>
            ) : null}
          </label>
          <label className={classes.field}>
            <span>Empresa *</span>
            <input
              autoComplete="organization"
              aria-invalid={errors.company ? true : undefined}
              aria-describedby={errors.company ? `${id}-company-error` : undefined}
              disabled={submitState === "loading" || !submitEnabled}
              {...register("company")}
            />
            {errors.company ? (
              <span id={`${id}-company-error`} className={classes.error} role="alert">
                {errors.company.message}
              </span>
            ) : null}
          </label>
          <label className={classes.field}>
            <span>Email laboral *</span>
            <input
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? `${id}-email-error` : undefined}
              disabled={submitState === "loading" || !submitEnabled}
              {...register("email")}
            />
            {errors.email ? (
              <span id={`${id}-email-error`} className={classes.error} role="alert">
                {errors.email.message}
              </span>
            ) : null}
          </label>
          <label className={classes.field}>
            <span>Cantidad de empleados *</span>
            <select
              aria-invalid={errors.employeeRange ? true : undefined}
              aria-describedby={errors.employeeRange ? `${id}-employeeRange-error` : undefined}
              disabled={submitState === "loading" || !submitEnabled}
              {...register("employeeRange")}
              defaultValue=""
            >
              <option value="" disabled>
                Seleccioná un rango
              </option>
              {EMPLOYEE_COUNT_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
            {errors.employeeRange ? (
              <span id={`${id}-employeeRange-error`} className={classes.error} role="alert">
                {errors.employeeRange.message}
              </span>
            ) : null}
          </label>
          <label className={classes.field}>
            <span>Teléfono / WhatsApp</span>
            <input
              type="tel"
              autoComplete="tel"
              disabled={submitState === "loading" || !submitEnabled}
              {...register("phone")}
            />
          </label>
          <label className={classes.field}>
            <span>Servicios / ubicaciones (aprox.)</span>
            <input
              disabled={submitState === "loading" || !submitEnabled}
              {...register("serviceLocations")}
            />
          </label>
        </div>

        <div id={statusId} className={classes.statusRegion} aria-live="polite" aria-atomic="true">
          {submitState === "success" ? (
            <p className={classes.success}>Recibimos tu solicitud. Te contactaremos a la brevedad.</p>
          ) : null}
          {submitState === "error" && submitError ? (
            <p className={classes.error} role="alert">
              {submitError}
            </p>
          ) : null}
          {!submitEnabled ? (
            <p className={classes.pendingNote}>
              El envío online se habilita cuando la landing está vinculada al API.
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className={classes.submit}
          disabled={!submitEnabled || submitState === "loading" || submitState === "success"}
          aria-busy={submitState === "loading"}
          aria-describedby={statusId}
        >
          {submitState === "loading" ? "Enviando…" : "Solicitar una demo"}
        </button>
        <p className={classes.privacyNote}>
          Al enviar el formulario aceptás que usemos tus datos para contactarte por la demo. Más info en nuestra{" "}
          <a href={PRIVACY_POLICY_SEO.pathname}>Política de privacidad</a>.
        </p>
      </form>
    </div>
  );
}