import { Icon } from './Icon';
import styles from './WizardSteps.module.css';

export interface WizardStepDef {
  id: string;
  label: string;
}

export interface WizardStepsProps {
  steps: WizardStepDef[];
  currentIndex: number;
  furthestValidIndex: number;
  onJump: (index: number) => void;
}

export function WizardSteps({ steps, currentIndex, furthestValidIndex, onJump }: WizardStepsProps) {
  const lastIndex = Math.max(steps.length - 1, 1);
  const doneWidth = (Math.min(furthestValidIndex, lastIndex) / lastIndex) * 100;
  const currentWidth = currentIndex > furthestValidIndex ? 0 : (1 / lastIndex) * 100;

  return (
    <nav className={styles.wizard} aria-label="Tournament creation steps">
      <ol className={styles.badges}>
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex && index <= furthestValidIndex;
          const isCurrent = index === currentIndex;
          const isReachable = index <= furthestValidIndex;
          return (
            <li key={step.id} className={styles.badgeItem}>
              <button
                type="button"
                className={`${styles.badge ?? ''} ${isCompleted ? (styles.badgeDone ?? '') : ''} ${isCurrent ? (styles.badgeCurrent ?? '') : ''}`}
                disabled={!isReachable}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={isCompleted ? `${step.label}, completed` : step.label}
                onClick={() => isReachable && onJump(index)}
              >
                {isCompleted ? <Icon name="check" size={14} /> : index + 1}
              </button>
              <span
                className={`${styles.badgeLabel ?? ''} ${isCurrent ? (styles.badgeLabelCurrent ?? '') : ''}`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.track}>
        <div className={styles.fillDone} style={{ width: `${doneWidth}%` }} />
        <div
          className={styles.fillCurrent}
          style={{ left: `${doneWidth}%`, width: `${currentWidth}%` }}
        />
      </div>
      <p className={styles.mobileLabel} aria-hidden="true">
        Step {currentIndex + 1} of {steps.length}: {steps[currentIndex]?.label}
      </p>
    </nav>
  );
}
