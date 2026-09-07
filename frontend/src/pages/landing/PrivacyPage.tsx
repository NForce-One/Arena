import { ContentPage } from './ContentPage';
import { LEGAL_UPDATED, PrivacyContent } from './legalContent';

export function PrivacyPage() {
  return (
    <ContentPage eyebrow="Legal" title="Privacy Policy" updated={LEGAL_UPDATED}>
      <PrivacyContent />
    </ContentPage>
  );
}
