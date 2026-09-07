import { ContentPage } from './ContentPage';
import { CookiesContent, LEGAL_UPDATED } from './legalContent';

export function CookiesPage() {
  return (
    <ContentPage eyebrow="Legal" title="Cookie Policy" updated={LEGAL_UPDATED}>
      <CookiesContent />
    </ContentPage>
  );
}
