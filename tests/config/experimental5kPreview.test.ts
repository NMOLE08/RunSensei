import { isExperimental5kPreviewEnabled } from '@/config/experimental5kPreview';

it('requires both a development build and explicit experimental opt-in', () => {
  expect(isExperimental5kPreviewEnabled({ isDevelopment: true, previewFlag: 'true' })).toBe(true);
  expect(isExperimental5kPreviewEnabled({ isDevelopment: false, previewFlag: 'true' })).toBe(false);
  expect(isExperimental5kPreviewEnabled({ isDevelopment: true, previewFlag: undefined })).toBe(false);
  expect(isExperimental5kPreviewEnabled({ isDevelopment: false, internalResearchBuild: true, previewFlag: 'true' })).toBe(true);
  expect(isExperimental5kPreviewEnabled({ isDevelopment: false, internalResearchBuild: false, previewFlag: 'true' })).toBe(false);
});
