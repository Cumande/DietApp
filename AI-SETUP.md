# AI meal estimates

The feature accepts meal descriptions, returns ingredient estimates, and lets you edit grams and calories per 100g before explicitly saving. It does not save model output automatically. The home screen creates new meals and preserves existing entries. Estimates remain labeled as AI estimates in the meal card.

## Enable in Vercel

In the existing `diet-app` project, open Settings → Environment Variables and add this as a sensitive value for Production:

- `OPENAI_API_KEY`: your OpenAI project API key. Use an API project with billing enabled. Never put this in the app UI, GitHub, or chat.
- The estimator uses `gpt-4o-mini` for text and photos. `OPENAI_MODEL` is no longer used.

Redeploy after adding the variables. The API returns a setup message until OPENAI_API_KEY exists. No API keys are available in this repository.

Meal descriptions are sent to OpenAI via the server, using the Responses API with `store: false`. That setting is not a guarantee of zero provider retention.

## Verify

Open Today → What did you eat? Enter `200g cooked rice, 150g grilled chicken and 1 tbsp olive oil`. Review the ingredient list, adjust portions, then save. Check that the day's total changes and the saved meal appears on another device. Each Save meal creates a new meal; no meal slot or food database selection is required.

Tests mock OpenAI responses, so passing tests do not verify a live API key, billing, model access, or nutrition accuracy. Run `npm test` for API configuration checks, error handling, output validation, editable portions and persistence.

Reference: https://developers.openai.com/api/docs/guides/structured-outputs

## Meal and nutrition-label photos

Use Take photo for the rear camera on supported phones, or the file picker on devices without camera capture. Choose one JPEG, PNG or WebP image (up to 12 MB) on the home screen. The browser resizes it to at most 1600 pixels on its longest side and re-encodes it as JPEG before upload (under 2 MB). HEIC files need exporting to JPEG. The preview is kept only in page memory. Removing/changing a photo invalidates the previous estimate. Images are sent to OpenAI only on Estimate; they are not stored in the app's local storage or Supabase history. The model must support image input; gpt-4o-mini does.

For labels, include how much you ate and photograph the serving size and energy information clearly. The prompt asks for clarification when portions or label values are missing. The calorie total and Save meal button appear first; ingredient fields are available under Adjust estimate.

Automated tests check multimodal requests, invalid images, size limits, photo-only estimates, and image-free persistence. Real camera/file-picker behavior, browser resizing, and AI photo accuracy still require a device check.

The AI access-code requirement has been removed at the owner’s request. `AI_ACCESS_CODE` is no longer read and can be deleted from Vercel. Estimates are available to visitors without a code; the OpenAI API key stays on the server.
