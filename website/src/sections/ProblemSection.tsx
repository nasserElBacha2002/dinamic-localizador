import shared from "../styles/landing-shared.module.css";
import { ProblemChaosRoadmap } from "./problem/ProblemChaosRoadmap";
import classes from "./sections.module.css";

export function ProblemSection() {
  return (
    <section
      className={`${shared.section} ${classes.problem} ${classes.problemScene} ${classes.problemChaos} ${shared.centered}`}
      aria-labelledby="problem-title"
    >
      <div className={shared.sectionInner}>
        <h2 id="problem-title" className={`${shared.title} ${classes.problemTitle}`}>
          Coordinar no debería sentirse así.
        </h2>
        <ProblemChaosRoadmap />
      </div>
    </section>
  );
}
