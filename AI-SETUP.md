# AI meal estimates

The feature accepts meal descriptions, returns ingredient estimates, and lets you edit grams and calories per 100g before explicitly saving. It does not save model output automatically. Existing foods are replaced only after confirmation. Estimates remain labeled as AI estimates in the meal card.

## Enable in Vercel

In the existing `diet-app` project, open Settings → Environment Variables and add these as sensitive values for Production:

- `OPENAI_API_KEY`: your OpenAI project API key. Use an API project with billing enabled. Never put this in the app UI, GitHub, or chat.
- `AI_ACCESS_CODE`: a random private code of at least 16 characters. Enter this code in the app's AI panel. This protects paid requests on the otherwise public app; it does not protect the existing nutrition-data API.
- Optional `OPENAI_MODEL`: defaults to `gpt-4.1-mini`.

Redeploy after adding the variables. The API returns a setup message until both required variables exist. No API keys are available in this repository.

The browser remembers the access code only in memory until a page reload. Meal descriptions are sent to OpenAI via the server, using the Responses API with `store: false`. That setting is not a guarantee of zero provider retention.

## Verify

Open Today → a meal → Estimate calories with AI. Enter your access code and `200g cooked rice, 150g grilled chicken and 1 tbsp olive oil`. Review the ingredient list, adjust portions, then save. Check that the day's total changes and the saved meal appears on another device. For an extra meal, first choose + Extra meal.

Tests mock OpenAI responses, so passing tests do not verify a live API key, billing, model access, or nutrition accuracy. Run `npm test` for API access checks, error handling, output validation, editable portions and persistence.

Reference: https://developers.openai.com/api/docs/guides/structured-outputs

## Meal and nutrition-label photos

Choose one JPEG, PNG or WebP image (up to 12 MB) in a meal's AI panel. The browser resizes it to at most 1600 pixels on its longest side and re-encodes it as JPEG before upload (under 2 MB). HEIC files need exporting to JPEG. The preview is kept only in page memory. Removing/changing a photo invalidates the previous estimate. Images are sent to OpenAI only on Estimate; they are not stored in the app's local storage or Supabase history. The model must support image input; the default gpt-4.1-mini does.

For labels, include how much you ate and photograph the serving size and energy information clearly. The prompt asks for clarification when portions or label values are missing. The ingredient review and explicit save are unchanged.

Automated tests check multimodal requests, invalid images, size limits, photo-only estimates, and image-free persistence. Real camera/file-picker behavior, browser resizing, and AI photo accuracy still require a device check.
