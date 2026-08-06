import { assetUrl } from "../../helpers.js";
import type { Alternative } from "../../shared/types/exam.js";
import styles from "../ExamApp/ExamApp.module.css";

interface Props { alternatives: Alternative[]; selected: string | null; disabled: boolean; onSelect: (id: string) => void }

export function AlternativeList({ alternatives, selected, disabled, onSelect }: Props) {
  return <fieldset className={styles.alternatives} disabled={disabled} aria-label="Alternativas">
    {alternatives.map((alternative) => <button
      type="button"
      key={alternative.id}
      className={`${styles.alternative} ${selected === alternative.id ? styles.selected : ""}`}
      aria-pressed={selected === alternative.id}
      onClick={() => onSelect(alternative.id)}
    >
      <span className={styles.letter}>{alternative.id}</span>
      {alternative.image
        ? <img src={assetUrl(alternative.image)} alt={`Alternativa ${alternative.id}`} className={styles.alternativeImage} />
        : <span>{alternative.text}</span>}
    </button>)}
  </fieldset>;
}
