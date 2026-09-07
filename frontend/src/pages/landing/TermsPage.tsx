import { ContentPage } from './ContentPage';
import { LEGAL_UPDATED, TermsContent } from './legalContent';

export function TermsPage() {
  return (
    <ContentPage eyebrow="Legal" title="Terms of Service" updated={LEGAL_UPDATED}>
      <TermsContent />
    </ContentPage>
  );
}
