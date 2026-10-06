import { zodResolver } from "@hookform/resolvers/zod";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { trackMarketingEvent } from "../analytics/marketing-events";
import { isDemoSubmitEnabled } from "../api/demo-request.api";
import { EMPLOYEE_COUNT_RANGES } from "../content/landing-content";
import classes from "./demo-request-form.module.css";

const demoSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresá nombre y apellido"),
  company: z.string().trim().min(2, "Ingresá el nombre de la empresa"),
  email: z.string().trim().email("Ingresá un email laboral válido"),
  employeeRange: z.string().min(1, "Seleccioná un rango"),
  phone: z.string().trim().optional(),
  serviceLocations: z.string().trim().optional(),
});

type DemoRequestFormValues = z.infer<typeof demoSchema>;

type DemoRequestFormProps = {
  id?: string;
};

export function DemoRequestForm({ id = "solicitar-demo" }: DemoRequestFormProps) {
  const startedRef = useRef(false);

  const {
    register,
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
    },
  });

  return (
    <div className={classes.form}>
      <form
        id={id}
        noValidate
        onSubmit={(event) => event.preventDefault()}
        onFocusCapture={() => {
          if (startedRef.current) {
            return;
          }
          startedRef.current = true;
          trackMarketingEvent("demo_form_start");
        }}
      >
        <div className={classes.grid}>
          <label className={classes.field}>
            <span>Nombre y apellido *</span>
            <input autoComplete="name" {...register("fullName")} />
            {errors.fullName ? <span className={classes.error}>{errors.fullName.message}</span> : null}
          </label>
          <label className={classes.field}>
            <span>Empresa *</span>
            <input autoComplete="organization" {...register("company")} />
            {errors.company ? <span className={classes.error}>{errors.company.message}</span> : null}
          </label>
          <label className={classes.field}>
            <span>Email laboral *</span>
            <input type="email" autoComplete="email" {...register("email")} />
            {errors.email ? <span className={classes.error}>{errors.email.message}</span> : null}
          </label>
          <label className={classes.field}>
            <span>Cantidad de empleados *</span>
            <select {...register("employeeRange")} defaultValue="">
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
              <span className={classes.error}>{errors.employeeRange.message}</span>
            ) : null}
          </label>
          <label className={classes.field}>
            <span>Teléfono / WhatsApp</span>
            <input type="tel" autoComplete="tel" {...register("phone")} />
          </label>
          <label className={classes.field}>
            <span>Servicios / ubicaciones (aprox.)</span>
            <input {...register("serviceLocations")} />
          </label>
        </div>
        <p className={classes.pendingNote}>Solicitudes online próximamente.</p>
        <button type="submit" className={classes.submit} disabled={!isDemoSubmitEnabled}>
          Solicitar una demo
        </button>
        <p className={classes.note}>Disponible próximamente.</p>
      </form>
    </div>
  );
}
