import { assertPermittedPlanningSource, parseStravaCompletionUrl } from '@/domain/integrations/strava';
import { stravaActivityViewerEnabled, stravaPersonalizationEnabled } from '@/config/productMode';

describe('Strava integration policy boundary', () => {
  const redirect = 'aisensei:///integrations/strava-complete';

  it('accepts only an opaque completion ticket on the expected app redirect', () => {
    expect(parseStravaCompletionUrl(`${redirect}?ticket=opaque-ticket-123456`, redirect)).toEqual({ kind: 'success', ticket: 'opaque-ticket-123456' });
    expect(parseStravaCompletionUrl('aisensei:///wrong?ticket=opaque-ticket-123456', redirect)).toEqual({ kind: 'invalid' });
    expect(parseStravaCompletionUrl(`${redirect}?access_token=secret`, redirect)).toEqual({ kind: 'invalid' });
  });

  it('handles denial without treating it as a connection', () => {
    expect(parseStravaCompletionUrl(`${redirect}?error=access_denied`, redirect)).toEqual({ kind: 'denied' });
  });

  it('hard-disables activity viewing and Strava-derived personalization', () => {
    expect(stravaActivityViewerEnabled).toBe(false);
    expect(stravaPersonalizationEnabled).toBe(false);
    expect(() => assertPermittedPlanningSource('runsensei')).not.toThrow();
    expect(() => assertPermittedPlanningSource('self_reported')).not.toThrow();
    expect(() => assertPermittedPlanningSource('strava')).toThrow('cannot be used for plan personalization');
  });
});
